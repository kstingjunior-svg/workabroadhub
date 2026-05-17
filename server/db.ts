import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";

import { users, payments, subscriptions } from "../shared/schema";

const { Pool } = pkg;

// Single shared pg Pool for the entire app.
// Drizzle used to be wired to postgres-js (porsager/postgres), which threw
// ERR_INVALID_ARG_TYPE inside its Bind step whenever a parameter resolved
// to a Date, even when the storage layer pre-converted to an ISO string.
// Switching Drizzle to the pg driver removes that whole code path: pg
// handles JS Dates natively. The legacy pg Pool was already used by the
// session store, payment migrations, etc, so the app now goes through one
// connection pool end-to-end.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export const db = drizzle(pool, {
  schema: { users, payments, subscriptions },
});
