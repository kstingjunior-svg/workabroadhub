import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";

import { users, payments, subscriptions } from "../shared/schema";

const { Pool } = pkg;

// ── Single shared `pg` Pool for the entire app ──────────────────────────────
// Previously this file used `postgres-js` (porsager/postgres) as Drizzle's
// driver and exposed a separate `pg` Pool for legacy code. In production we
// hit a hard-to-reproduce ERR_INVALID_ARG_TYPE inside postgres-js 3.4.9's
// Bind step whenever a parameter resolved to a Date — even after explicit
// ISO-string conversion in the storage layer, Drizzle's column-typed
// encoders were re-wrapping the value and the Date kept reaching
// Buffer.byteLength. Switching Drizzle to the `pg` driver removes that whole
// code path: `pg` ships its own date encoder that handles JS Dates natively
// and never throws on parameter binding. The `pg` Pool is also what the
// session store, payment migrations, and other legacy code already use, so
// the app now goes through ONE connection pool end-to-end.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export const db = drizzle(pool, {
  schema: { users, payments, subscriptions },
});