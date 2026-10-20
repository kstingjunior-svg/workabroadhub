/**
 * Kenya Careers file storage (2026-10, School Recruitment Portal).
 *
 *  - Applicant CVs / certificates → PRIVATE bucket `kc-application-files`.
 *    Stored as "kcfile:<path>" in local_job_applications.cv_url /
 *    certificates_url. Never public; employers get a 2-minute signed URL
 *    via GET /api/employer/applications/:id/file/:kind after an admin check.
 *  - School logos → PUBLIC bucket `school-logos` (logos are public info).
 *
 * Only the server (service role) can write to either bucket — storage.objects
 * has no policies for anon/authenticated.
 */
import crypto from "crypto";
import { getSupabaseAdmin } from "../supabaseClient";

export const APPLICATION_BUCKET = "kc-application-files";
export const LOGO_BUCKET = "school-logos";
export const KCFILE_PREFIX = "kcfile:";

const EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic",
};

export async function uploadApplicationFile(opts: {
  userId: string; jobId: string; kind: "cv" | "certificates";
  buffer: Buffer; mimeType: string;
}): Promise<string | null> {
  const client = getSupabaseAdmin();
  if (!client) { console.warn("[kc-files] no service-role client — upload skipped"); return null; }
  const ext = EXT[opts.mimeType] ?? "bin";
  // Random path segment — never guessable, never contains the original filename.
  const path = `${opts.jobId}/${opts.userId}/${opts.kind}-${crypto.randomBytes(12).toString("hex")}.${ext}`;
  const { error } = await client.storage.from(APPLICATION_BUCKET).upload(path, opts.buffer, {
    contentType: opts.mimeType, upsert: false,
  });
  if (error) { console.warn(`[kc-files] upload failed (${opts.kind}):`, error.message); return null; }
  return `${KCFILE_PREFIX}${path}`;
}

/** Short-lived signed URL for a stored application file, or null. */
export async function signedApplicationFileUrl(stored: string | null, seconds = 120): Promise<string | null> {
  if (!stored) return null;
  if (!stored.startsWith(KCFILE_PREFIX)) return null; // legacy/unknown — never proxy arbitrary URLs
  const client = getSupabaseAdmin();
  if (!client) return null;
  const { data, error } = await client.storage.from(APPLICATION_BUCKET)
    .createSignedUrl(stored.slice(KCFILE_PREFIX.length), seconds);
  if (error) { console.warn("[kc-files] signed URL failed:", error.message); return null; }
  return data?.signedUrl ?? null;
}

export async function uploadSchoolLogo(companyId: string, buffer: Buffer, mimeType: string): Promise<string | null> {
  const client = getSupabaseAdmin();
  if (!client) return null;
  const ext = EXT[mimeType] ?? "png";
  const path = `${companyId}/logo-${Date.now()}.${ext}`;
  const { error } = await client.storage.from(LOGO_BUCKET).upload(path, buffer, { contentType: mimeType, upsert: false });
  if (error) { console.warn("[kc-files] logo upload failed:", error.message); return null; }
  return client.storage.from(LOGO_BUCKET).getPublicUrl(path).data?.publicUrl ?? null;
}
