import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
const ssl =
  process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : undefined;

export const pool = new Pool({
  connectionString,
  ssl,
  max: process.env.PG_MAX_CONNECTIONS ? parseInt(process.env.PG_MAX_CONNECTIONS) : 3,
});
