import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import pg from "pg";

import * as schema from "../shared/schema";
import { users, payments, subscriptions } from "../shared/schema";

// Drizzle/Postgres.js client
const client = postgres(process.env.DATABASE_URL!, {
  ssl: "require",
});

// Drizzle ORM
export const db = drizzle(client, {
  schema: { users, payments, subscriptions },
});

// LEGACY pool support
const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});