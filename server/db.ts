import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";

// Note: `subscriptions` used to be imported here but that symbol doesn't
// exist on the schema (the real export is `userSubscriptions`). Pulling in
// an undefined name caused the Drizzle schema map to be `{ subscriptions: undefined }`,
// which sometimes broke relational query plumbing. Using a wildcard import
// gives Drizzle the entire schema in one shot and stays correct even when
// new tables are added.
import * as schema from "../shared/schema";

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

export const db = drizzle(pool, { schema });
