-- 2026-07 (Tony's founder request): passport-style photo upload attached to
-- CV / resume / write-from-scratch orders. Photo is embedded top-right in
-- both PDF and DOCX output for a warm, personal touch — Tony's framing:
-- "I want our CVs not to be same as anyone. The photo makes it feel real."
--
-- Storage: base64 data URL ("data:image/jpeg;base64,...") so the render code
-- can slice back into a Buffer with mime info in one line. Client compresses
-- to ~400x400 JPEG (~50-150 KB) before upload, so the stored payload is well
-- under the 2 MB server cap.
--
-- Optional: NULL on every existing row, NULL on new orders where the user
-- skipped the upload. Renderer treats NULL as "no photo" and produces
-- exactly the pre-2026-07 layout — so this is fully backwards compatible.
--
-- Safe to re-run. Idempotent.

ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS photo_data TEXT;

COMMENT ON COLUMN service_orders.photo_data IS
  'Optional passport-style photo as base64 data URL. Embedded top-right in delivered PDF/DOCX.';
