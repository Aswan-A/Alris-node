import { pool } from "../config/db.js";

export async function initDb() {
  // USERS TABLE
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT now()
    );
  `);

  // AUTHORITIES TABLE
  await pool.query(`
    CREATE TABLE IF NOT EXISTS authorities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT,  
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      phone TEXT,
      latitude DOUBLE PRECISION DEFAULT 0,  
      longitude DOUBLE PRECISION DEFAULT 0,  
      location geometry(Point, 4326) DEFAULT ST_SetSRID(ST_MakePoint(0, 0), 4326),
      department TEXT NOT NULL,
      is_initialized BOOLEAN DEFAULT false,  
      created_at TIMESTAMP DEFAULT now()
    );
  `);

  // HIGHER AUTHORITIES TABLE
  await pool.query(`
    CREATE TABLE IF NOT EXISTS higherauthorities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      phone TEXT,
      department TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT now()
    );
  `);

  // ISSUES TABLE (canonical issues, merged from reports)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS issues (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      latitude DOUBLE PRECISION NOT NULL,
      longitude DOUBLE PRECISION NOT NULL,
      location geometry(Point, 4326) NOT NULL,
      category TEXT,
      department TEXT,
      status TEXT CHECK (status IN ('submitted', 'ongoing', 'resolved', 'rejected')) DEFAULT 'submitted',
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );
  `);

  // Create spatial index for issues location
  await pool.query(`
    CREATE INDEX IF NOT EXISTS issues_location_gix ON issues USING GIST (location);
  `);

  // REPORTS TABLE (raw citizen reports)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
      latitude DOUBLE PRECISION NOT NULL,
      longitude DOUBLE PRECISION NOT NULL,
      location geometry(Point, 4326) NOT NULL,
      description TEXT,
      is_classified BOOLEAN DEFAULT false,
      updated_at TIMESTAMP DEFAULT now(),
      created_at TIMESTAMP DEFAULT now()
    );
  `);

  // Index for spatial queries on reports
  await pool.query(`
    CREATE INDEX IF NOT EXISTS reports_location_gix ON reports USING GIST (location);
  `);

  // Index for batch classification queries
  await pool.query(`
    CREATE INDEX IF NOT EXISTS reports_is_classified_idx ON reports(is_classified);
  `);

  // REPORT UPLOADS TABLE
  await pool.query(`
    CREATE TABLE IF NOT EXISTS report_uploads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      embedding vector(512),
      is_fake BOOLEAN DEFAULT false,
      is_spam BOOLEAN DEFAULT false,
      uploaded_at TIMESTAMP DEFAULT now()
    );
  `);

  // REFRESH TOKENS TABLE
  await pool.query(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID ,
      token TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT now()
    );
  `);

  await pool.query(`
  CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx ON refresh_tokens(user_id);
`);
  await pool.query(`
  CREATE INDEX IF NOT EXISTS refresh_tokens_token_idx ON refresh_tokens(token);
`);

  console.log("✅ Database initialized");
}
