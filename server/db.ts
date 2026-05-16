import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../shared/schema";

const client = postgres(process.env.DATABASE_URL!, {
  ssl: "require",
});

export const pool = client;

export const db = drizzle(client, {
  schema,
});