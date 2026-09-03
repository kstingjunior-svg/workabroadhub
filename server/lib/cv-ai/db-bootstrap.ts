// ─────────────────────────────────────────────────────────────────────────────
// db-bootstrap — idempotent Postgres schema for the CV AI pipeline.
//
// Same pattern as server/routes/hub.ts::bootstrapHubSchema: runs once at
// server startup, CREATE ... IF NOT EXISTS everywhere, ALTER ADD COLUMN
// IF NOT EXISTS for every added column since first ship. Safe to re-run.
// Never destroys data.
//
// Requires the pgvector extension. On Supabase this is available; the
// CREATE EXTENSION is idempotent and no-ops if already installed. If the
// extension can't be enabled (e.g. hosted Postgres without pgvector),
// we swallow the error and log — the uniqueness gate degrades to disabled
// but the rest of the pipeline keeps working.
// ─────────────────────────────────────────────────────────────────────────────

import { pool } from "../../db";

let bootstrapped = false;
let vectorEnabled = false;

// 2026-09 EMERGENCY: hard 15s timeout wrapper. Every DDL statement in
// here MUST complete within this budget or we bail — because prior to
// this the caller in server/index.ts awaited us and a hung Supabase
// call blocked server startup, taking every route (including /dashboard
// and every M-Pesa path) offline behind an Express 'Cannot GET' response.
// Even now that we're called fire-and-forget, don't leak an infinite
// Promise onto the process — bound it.
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[cv-ai/db] ${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

export async function bootstrapCvAiSchema(): Promise<{ vectorEnabled: boolean }> {
  if (bootstrapped) return { vectorEnabled };

  try {
    // 1. pgvector — soft-required. If it fails, uniqueness gate turns off.
    try {
      await withTimeout(pool.query(`CREATE EXTENSION IF NOT EXISTS vector`), 8000, "CREATE EXTENSION vector");
      vectorEnabled = true;
    } catch (err: any) {
      console.warn(
        `[cv-ai/db] pgvector unavailable — uniqueness gate will be a no-op. ` +
        `To enable: CREATE EXTENSION vector; as a superuser. Error: ${err?.message}`,
      );
      vectorEnabled = false;
    }

    // 2. Main table. Embedding column only added if vector is available.
    await withTimeout(pool.query(`
      CREATE TABLE IF NOT EXISTS cv_generations (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id        text,
        source_hash    text NOT NULL,
        jd_hash        text,
        industry       text NOT NULL DEFAULT 'general',
        seniority_band text NOT NULL DEFAULT 'mid',
        voice          text NOT NULL,
        structure      text NOT NULL,
        region         text NOT NULL DEFAULT 'KE',
        input_score    integer NOT NULL,
        output_score   integer NOT NULL,
        improvement    integer NOT NULL,
        retries        integer NOT NULL DEFAULT 0,
        hit_target     boolean NOT NULL DEFAULT false,
        cv_markdown    text NOT NULL,
        generation_ms  integer,
        created_at     timestamptz NOT NULL DEFAULT NOW()
      )
    `), 8000, "CREATE TABLE cv_generations");

    // 3. Embedding column — only if pgvector loaded. ALTER IF NOT EXISTS
    // makes this safe on re-run.
    if (vectorEnabled) {
      await pool.query(`
        ALTER TABLE cv_generations
        ADD COLUMN IF NOT EXISTS embedding vector(1536)
      `);
    }

    // 4. Indexes. All idempotent.
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_cv_generations_user ON cv_generations(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_cv_generations_bucket ON cv_generations(industry, seniority_band)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_cv_generations_created ON cv_generations(created_at DESC)`);

    // 5. Vector index — ivfflat for fast approximate cosine similarity.
    // Only build once, on the first row insertion is fine — ivfflat needs
    // data to train. We create it here regardless; empty table is fine,
    // Postgres just builds an empty index.
    if (vectorEnabled) {
      try {
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_cv_generations_embedding
            ON cv_generations USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = 100)
        `);
      } catch (err: any) {
        // ivfflat may need to be built after some rows exist; harmless.
        console.warn(`[cv-ai/db] ivfflat index build deferred: ${err?.message}`);
      }
    }

    console.log(`[cv-ai/db] schema bootstrap complete (pgvector=${vectorEnabled ? "on" : "off"})`);
    bootstrapped = true;
    return { vectorEnabled };
  } catch (err: any) {
    console.error(`[cv-ai/db] bootstrap FAILED: ${err?.message}`);
    // Don't throw — server should still start. Uniqueness + persistence
    // just won't work.
    return { vectorEnabled: false };
  }
}

/** Read-only accessor so downstream can check without re-bootstrapping. */
export function isVectorEnabled(): boolean {
  return vectorEnabled;
}
