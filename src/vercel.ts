import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";
import { pool } from "./config/db.js";

// Initialize PostGIS columns on cold start
(async () => {
  try {
    await pool.query("CREATE EXTENSION IF NOT EXISTS postgis;");

    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'issues' AND column_name = 'location'
        ) THEN
          ALTER TABLE issues ADD COLUMN location geometry(Point, 4326);
        END IF;
      END $$;
    `);
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'reports' AND column_name = 'location'
        ) THEN
          ALTER TABLE reports ADD COLUMN location geometry(Point, 4326);
        END IF;
      END $$;
    `);
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'authorities' AND column_name = 'location'
        ) THEN
          ALTER TABLE authorities ADD COLUMN location geometry(Point, 4326)
            DEFAULT ST_SetSRID(ST_MakePoint(0, 0), 4326);
        END IF;
      END $$;
    `);

    await pool.query("CREATE INDEX IF NOT EXISTS issues_location_gix ON issues USING GIST (location);");
    await pool.query("CREATE INDEX IF NOT EXISTS reports_location_gix ON reports USING GIST (location);");
    await pool.query("CREATE INDEX IF NOT EXISTS authorities_location_gix ON authorities USING GIST (location);");

    await pool.query("CREATE EXTENSION IF NOT EXISTS vector;").catch(() => { });
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'report_uploads' AND column_name = 'embedding'
        ) THEN
          ALTER TABLE report_uploads ADD COLUMN embedding vector(512);
        END IF;
      END $$;
    `).catch(() => { });

    console.log("✅ Vercel: DB initialized");
  } catch (err) {
    console.error("❌ Vercel DB init error:", err);
  }
})();

export default app;
