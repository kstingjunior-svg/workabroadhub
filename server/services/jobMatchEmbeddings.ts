// ─────────────────────────────────────────────────────────────────────────────
// Job match — semantic similarity between a candidate CV and the
// VISA_JOBS catalogue using OpenAI text-embedding-3-small (1536 dims).
//
// HOW IT WORKS:
//   1. On boot: every job in the VISA_JOBS array gets embedded once and
//      cached in the job_embeddings table (keyed by job_id + a hash of
//      the job text, so a job edit forces re-embedding).
//   2. At match time: we embed the candidate's CV text once (~$0.00002),
//      load ALL job embeddings into memory (~50-200 rows, microseconds),
//      compute cosine similarity in Node, and return the top-K.
//   3. We also UPSERT the user's CV embedding into user_cv_embeddings so
//      the dashboard "Today's Best Match" widget can run on every page
//      load without ever asking them to re-upload.
//
// WHY NOT pgvector:
//   Render's managed Postgres doesn't enable pgvector by default and
//   activating it requires a support ticket. For <1000 jobs, pure-Node
//   cosine similarity is plenty fast and dependency-free.
//
// COST:
//   ~$0.00002 per CV embedded, ~$0.001 to embed 100 jobs once.
// ─────────────────────────────────────────────────────────────────────────────

import { pool } from "../db";
import crypto from "crypto";

const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIMS  = 1536;

interface JobEmbeddingRow {
  job_id: string;
  text_hash: string;
  embedding: number[];
}

interface JobLike {
  id: string;
  title: string;
  employer: string;
  country: string;
  city?: string;
  salary?: string;
  visaType?: string;
  category?: string;
  applyUrl?: string;
}

interface MatchResult extends JobLike {
  score: number;
  scorePct: number;
}

const SCHEMA_INIT = { done: false };

async function ensureSchema(): Promise<void> {
  if (SCHEMA_INIT.done) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS job_embeddings (
        job_id     VARCHAR(60) PRIMARY KEY,
        text_hash  VARCHAR(64) NOT NULL,
        embedding  DOUBLE PRECISION[] NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_cv_embeddings (
        user_id     VARCHAR(60) PRIMARY KEY,
        text_hash   VARCHAR(64) NOT NULL,
        embedding   DOUBLE PRECISION[] NOT NULL,
        cv_preview  TEXT,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    SCHEMA_INIT.done = true;
  } catch (err: any) {
    console.error("[job-match] ensureSchema failed:", err?.message ?? err);
  }
}

async function embedText(text: string): Promise<number[]> {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 8000);
  if (!clean) throw new Error("empty text");

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: clean }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`embedding failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
  const vec = data.data?.[0]?.embedding;
  if (!Array.isArray(vec) || vec.length !== EMBED_DIMS) {
    throw new Error(`unexpected embedding shape (len=${vec?.length})`);
  }
  return vec;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function jobText(j: JobLike): string {
  return [j.title, j.employer, j.country, j.city ?? "", j.salary ?? "", j.visaType ?? "", j.category ?? ""].filter(Boolean).join(" · ");
}

function hash(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export async function refreshJobEmbeddings(jobs: JobLike[]): Promise<{ inserted: number; updated: number; unchanged: number }> {
  await ensureSchema();
  let inserted = 0, updated = 0, unchanged = 0;
  const { rows: existing } = await pool.query<{ job_id: string; text_hash: string }>(`SELECT job_id, text_hash FROM job_embeddings`);
  const cached = new Map(existing.map((r) => [r.job_id, r.text_hash]));
  for (const job of jobs) {
    const text = jobText(job);
    const h = hash(text);
    const prev = cached.get(job.id);
    if (prev === h) { unchanged++; continue; }
    try {
      const vec = await embedText(text);
      if (prev) {
        await pool.query(`UPDATE job_embeddings SET text_hash = $2, embedding = $3, updated_at = NOW() WHERE job_id = $1`, [job.id, h, vec]);
        updated++;
      } else {
        await pool.query(
          `INSERT INTO job_embeddings (job_id, text_hash, embedding) VALUES ($1, $2, $3) ON CONFLICT (job_id) DO UPDATE SET text_hash = EXCLUDED.text_hash, embedding = EXCLUDED.embedding, updated_at = NOW()`,
          [job.id, h, vec],
        );
        inserted++;
      }
    } catch (err: any) {
      console.warn(`[job-match] failed to embed ${job.id}: ${err?.message}`);
    }
  }
  if (inserted + updated > 0) {
    console.log(`[job-match] embeddings synced — ${inserted} inserted, ${updated} updated, ${unchanged} unchanged`);
  }
  return { inserted, updated, unchanged };
}

export async function findMatchesForCv(cvText: string, allJobs: JobLike[], limit = 10): Promise<MatchResult[]> {
  await ensureSchema();
  const cvVec = await embedText(cvText);
  const { rows } = await pool.query<JobEmbeddingRow>(`SELECT job_id, text_hash, embedding FROM job_embeddings`);
  const byId = new Map(allJobs.map((j) => [j.id, j]));
  const scored: MatchResult[] = [];
  for (const r of rows) {
    const job = byId.get(r.job_id);
    if (!job) continue;
    const s = cosine(cvVec, r.embedding);
    scored.push({ ...job, score: s, scorePct: Math.round(s * 100) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

// ─── Per-user CV embedding cache (for dashboard widget) ──────────────────────

export async function rememberUserCvEmbedding(userId: string, cvText: string): Promise<void> {
  if (!userId) return;
  await ensureSchema();
  const clean = cvText.replace(/\s+/g, " ").trim().slice(0, 8000);
  if (clean.length < 100) return;
  const h = hash(clean);
  try {
    const existing = await pool.query<{ text_hash: string }>(`SELECT text_hash FROM user_cv_embeddings WHERE user_id = $1`, [userId]);
    if (existing.rows[0]?.text_hash === h) return;
  } catch {}
  const vec = await embedText(clean);
  const preview = clean.slice(0, 300);
  await pool.query(
    `INSERT INTO user_cv_embeddings (user_id, text_hash, embedding, cv_preview) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id) DO UPDATE SET text_hash = EXCLUDED.text_hash, embedding = EXCLUDED.embedding, cv_preview = EXCLUDED.cv_preview, updated_at = NOW()`,
    [userId, h, vec, preview],
  );
}

export async function getUserCvEmbedding(userId: string): Promise<{ embedding: number[]; updatedAt: Date } | null> {
  if (!userId) return null;
  await ensureSchema();
  const { rows } = await pool.query<{ embedding: number[]; updated_at: Date }>(`SELECT embedding, updated_at FROM user_cv_embeddings WHERE user_id = $1`, [userId]);
  if (!rows.length) return null;
  return { embedding: rows[0].embedding, updatedAt: rows[0].updated_at };
}

export async function findMatchesFromCachedEmbedding(userId: string, allJobs: JobLike[], limit = 3): Promise<MatchResult[] | null> {
  const cached = await getUserCvEmbedding(userId);
  if (!cached) return null;
  const { rows } = await pool.query<JobEmbeddingRow>(`SELECT job_id, text_hash, embedding FROM job_embeddings`);
  const byId = new Map(allJobs.map((j) => [j.id, j]));
  const scored: MatchResult[] = [];
  for (const r of rows) {
    const job = byId.get(r.job_id);
    if (!job) continue;
    const s = cosine(cached.embedding, r.embedding);
    scored.push({ ...job, score: s, scorePct: Math.round(s * 100) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
