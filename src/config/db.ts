import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

declare global {
  // avoid re-instantiating pool in dev hot-reload
  var pgPool: Pool | undefined;
}

export const pool = global.pgPool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

if (!global.pgPool) global.pgPool = pool;
