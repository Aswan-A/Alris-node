import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";
import { pool } from "./config/db.js";

const PORT = process.env.PORT || 4000;

(async () => {
  try {
    // Test database connection
    await pool.query("SELECT 1");
    console.log("✅ Database connected");

    // Create PostGIS extension if missing
    await pool.query("CREATE EXTENSION IF NOT EXISTS postgis;");

    // Create PostGIS geometry columns & spatial indexes for tables managed by Drizzle
    // (Drizzle doesn't natively support PostGIS geometry types)
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

    // Spatial indexes
    await pool.query(
      "CREATE INDEX IF NOT EXISTS issues_location_gix ON issues USING GIST (location);"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS reports_location_gix ON reports USING GIST (location);"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS authorities_location_gix ON authorities USING GIST (location);"
    );

    // pgvector extension + embedding column for AI server
    await pool.query("CREATE EXTENSION IF NOT EXISTS vector;").catch(() => {
      console.log("⚠️  pgvector extension not available — AI embeddings will not work");
    });
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

    console.log("✅ PostGIS columns & indexes ready");

    app.listen(PORT, () =>
      console.log(`🚀 Server running on http://localhost:${PORT}`)
    );
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
})();
