// ─────────────────────────────────────────────────────────────────────────────
// tool-scan-jobs.ts — shared background-job backing for the four paid AI
// verification tools (offer_check, visa_check, ielts_verify, job_scam_check).
//
// 2026-09 (Tony's "people are paying but I can't tell if it's working"
// report): all four tools ran their gpt-4o analysis SYNCHRONOUSLY inside the
// HTTP request — exactly the bug the ATS checker had before it was fixed
// with the job+poll pattern (see server/tools-routes.ts, migration 0049).
// Render's edge proxy kills any request around ~30s; production logs showed
// hundreds of real paid scans (65+ on offer-verify, 35+ on visa-verify in
// just the most recent sample, spanning weeks) dying to a 502 before the
// client ever saw a result. Because requireToolCredit() consumes the KES 100
// credit atomically BEFORE the slow analysis starts, every one of those was
// a real customer charged for a scan they never received.
//
// This module is the shared version of that same fix for all four tools:
// one small table (tool_scan_jobs, migration 0050) with a `tool` column
// instead of four near-identical copies of ats_check_jobs, and one shared
// status route instead of four.
// ─────────────────────────────────────────────────────────────────────────────
import { randomUUID } from "crypto";
import type { Express, Request, Response } from "express";
import { pool } from "../db";

export type ScanTool = "offer_check" | "visa_check" | "ielts_verify" | "job_scam_check";

export async function createToolScanJob(
  tool: ScanTool,
  userId: string | null,
  paymentId: string | null,
): Promise<string> {
  const jobId = randomUUID();
  await pool.query(
    `INSERT INTO tool_scan_jobs (id, tool, user_id, payment_id, status) VALUES ($1, $2, $3, $4, 'processing')`,
    [jobId, tool, userId, paymentId],
  );
  // Best-effort housekeeping — never blocks the response.
  pool.query(`DELETE FROM tool_scan_jobs WHERE created_at < NOW() - INTERVAL '24 hours'`).catch(() => {});
  return jobId;
}

export async function markToolScanJobDone(jobId: string, result: Record<string, any>): Promise<void> {
  await pool.query(
    `UPDATE tool_scan_jobs SET status = 'done', result = $2, updated_at = NOW() WHERE id = $1`,
    [jobId, JSON.stringify(result)],
  ).catch((err: any) => console.error(`[ToolScanJobs] failed to mark job ${jobId} done:`, err?.message));
}

export async function markToolScanJobError(jobId: string, message: string): Promise<void> {
  await pool.query(
    `UPDATE tool_scan_jobs SET status = 'error', error_message = $2, updated_at = NOW() WHERE id = $1`,
    [jobId, message],
  ).catch((err: any) => console.error(`[ToolScanJobs] failed to mark job ${jobId} error:`, err?.message));
}

// GET /api/tools/scan-status/:jobId — one shared poll endpoint for all four
// tools. jobId is a UUID (globally unique), so no need to disambiguate by
// tool; the stored `result` already carries the tool-specific response shape
// the client expects, unchanged from the old synchronous 200 body.
export function registerToolScanStatusRoute(app: Express): void {
  app.get("/api/tools/scan-status/:jobId", async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const { rows } = await pool.query(
        `SELECT status, result, error_message FROM tool_scan_jobs WHERE id = $1`,
        [jobId],
      );
      const job = rows[0];
      if (!job) {
        return res.status(404).json({ status: "error", message: "We couldn't find that check — please try again." });
      }
      if (job.status === "processing") {
        return res.json({ status: "processing" });
      }
      if (job.status === "error") {
        return res.json({ status: "error", message: job.error_message ?? "The check failed. Please try again." });
      }
      // status === "done" — result carries the exact shape the client
      // expects (ok/verdict/findings/etc.), same as the old synchronous
      // 200 response used to.
      return res.json({ status: "done", ...(job.result ?? {}) });
    } catch (err: any) {
      console.error("[ToolScanJobs status] error:", err?.message);
      res.status(500).json({ status: "error", message: "Could not check your result right now. Please try again." });
    }
  });
  console.log("[ToolScanJobs] ✓ /api/tools/scan-status/:jobId registered");
}
