import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { Pool } from "pg";

import * as schema from "../shared/schema";
import { users, payments, subscriptions } from "../shared/schema";

// postgres-js client (for drizzle)
const client = postgres(process.env.DATABASE_URL!, {
  ssl: "require",
});

// drizzle ORM
export const db = drizzle(client, {
  schema: { users, payments, subscriptions },
});

// pg Pool (legacy support)
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});