import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import pkg from "pg";

import * as schema from "../shared/schema";
import { users, payments, subscriptions } from "../shared/schema";

const { Pool } = pkg;

// Drizzle/Postgres.js client
const client = postgres(process.env.DATABASE_URL!, {
  ssl: "require",
});

// Drizzle ORM
export const db = drizzle(client, {
  schema: { users, payments, subscriptions },
});

// Legacy pool support
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});