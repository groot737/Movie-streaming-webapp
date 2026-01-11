import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
const ssl =
  process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : undefined;

export const pool = new Pool({
  connectionString,
  ssl,
});
