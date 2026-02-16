import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import dotenv from "dotenv";
import * as schema from "../database/schema.js";

dotenv.config();

declare global {
  var pgPool: Pool | undefined;
}

export const pool =
  global.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
  });

if (!global.pgPool) global.pgPool = pool;

// Drizzle ORM instance — use this for all typed queries
export const db = drizzle(pool, { schema });
