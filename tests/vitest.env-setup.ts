// ─────────────────────────────────────────────────────────────────────────────
// vitest.env-setup — runs before every test file.
//
// Stubs the env vars that server modules validate at import time so that
// simply importing a server module in a unit test doesn't throw. Real
// integration tests that need a live DB / real credentials should read
// process.env.REAL_DATABASE_URL etc. and skip when unset.
// ─────────────────────────────────────────────────────────────────────────────

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgres://ci:ci@localhost:5432/ci_stub';
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET || 'ci-stub-session-secret-32-chars-min';
process.env.SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || 'ci-stub-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'ci-stub-service-role-key';
