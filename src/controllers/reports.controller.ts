import type { Request, Response } from "express";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../config/db.js";
import {
  reports,
  users,
  auditLogs,
} from "../database/schema.js";
import { supabase, SUPABASE_BUCKET } from "../config/supabase.js";
import { asyncHandler } from "../middleware/error-handler.js";

// ─── Create Report ──────────────────────────────────────────────────────────

export const createReport = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { latitude, longitude, description } = req.body;
    const files = (req.files as Express.Multer.File[]) || [];

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        error: "Latitude and longitude are required",
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Insert report with PostGIS location
      const { rows: reportRows } = await client.query(
        `INSERT INTO reports (user_id, latitude, longitude, location, description)
         VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($3, $2), 4326), $4)
         RETURNING *`,
        [userId, latitude, longitude, description]
      );
      const report = reportRows[0]!;

      // Upload files to Supabase storage
      const uploads: any[] = [];
      for (const file of files) {
        const filename = `${report.id}/${Date.now()}-${file.originalname}`;
        const { error } = await supabase.storage
          .from(SUPABASE_BUCKET)
          .upload(filename, file.buffer, { contentType: file.mimetype });
        if (error) throw error;

        const publicUrl = supabase.storage
          .from(SUPABASE_BUCKET)
          .getPublicUrl(filename).data.publicUrl;

        const { rows: uploadRows } = await client.query(
          `INSERT INTO report_uploads (report_id, filename) VALUES ($1, $2) RETURNING *`,
          [report.id, publicUrl]
        );
        uploads.push(uploadRows[0]);
      }

      // Increment user's total_reports
      await client.query(
        `UPDATE users SET total_reports = total_reports + 1, updated_at = now() WHERE id = $1`,
        [userId]
      );

      // Audit log
      await client.query(
        `INSERT INTO audit_logs (actor_id, actor_role, action, entity_type, entity_id)
         VALUES ($1, 'citizen', 'report_created', 'report', $2)`,
        [userId, report.id]
      );

      await client.query("COMMIT");

      res.status(201).json({
        success: true,
        data: { report, uploads },
        message: "Report submitted successfully",
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(err);
      res
        .status(500)
        .json({ success: false, error: "Failed to create report" });
    } finally {
      client.release();
    }
  }
);

// ─── Get My Reports ─────────────────────────────────────────────────────────

export const getMyReports = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const { rows } = await pool.query(
      `SELECT 
        r.id, r.latitude, r.longitude, r.description, r.is_classified, r.created_at,
        json_build_object(
          'id', i.id, 'department', i.department, 'category', i.category,
          'status', i.status, 'created_at', i.created_at, 'updated_at', i.updated_at
        ) AS issue,
        COALESCE(
          json_agg(
            json_build_object(
              'id', ru.id, 'url', ru.filename, 'is_fake', ru.is_fake,
              'is_spam', ru.is_spam, 'uploaded_at', ru.uploaded_at
            )
          ) FILTER (WHERE ru.id IS NOT NULL), '[]'
        ) AS uploads
      FROM reports r
      LEFT JOIN report_uploads ru ON ru.report_id = r.id
      LEFT JOIN issues i ON r.issue_id = i.id
      WHERE r.user_id = $1
      GROUP BY r.id, i.id
      ORDER BY r.created_at DESC`,
      [userId]
    );

    res.json({ success: true, data: { reports: rows } });
  }
);

// ─── Get Report by ID ───────────────────────────────────────────────────────

export const getReportById = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const reportId = req.params["id"]!;

    const { rows } = await pool.query(
      `SELECT 
        r.id, r.latitude, r.longitude, r.description, r.is_classified, r.created_at,
        CASE WHEN r.is_classified THEN
          json_build_object(
            'id', i.id, 'department', i.department, 'category', i.category,
            'status', i.status, 'created_at', i.created_at, 'updated_at', i.updated_at
          )
        ELSE NULL END AS issue,
        COALESCE(
          json_agg(
            json_build_object(
              'id', ru.id, 'url', ru.filename, 'is_fake', ru.is_fake,
              'is_spam', ru.is_spam, 'uploaded_at', ru.uploaded_at
            )
          ) FILTER (WHERE ru.id IS NOT NULL), '[]'
        ) AS uploads
      FROM reports r
      LEFT JOIN report_uploads ru ON ru.report_id = r.id
      LEFT JOIN issues i ON r.issue_id = i.id
      WHERE r.id = $1 AND r.user_id = $2
      GROUP BY r.id, i.id`,
      [reportId, userId]
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Report not found" });
    }

    res.json({ success: true, data: { report: rows[0] } });
  }
);

// ─── Delete Report ──────────────────────────────────────────────────────────

export const deleteReport = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const reportId = req.params["id"]!;

    // Verify ownership
    const reportRows = await db
      .select({ id: reports.id, userId: reports.userId })
      .from(reports)
      .where(eq(reports.id, reportId))
      .limit(1);

    if (reportRows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Report not found" });
    }

    if (reportRows[0]!.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: "You can only delete your own reports",
      });
    }

    await db.delete(reports).where(eq(reports.id, reportId));

    // Decrement user's total_reports
    await db
      .update(users)
      .set({
        totalReports: sql`GREATEST(${users.totalReports} - 1, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Audit log
    await db.insert(auditLogs).values({
      actorId: userId,
      actorRole: "citizen",
      action: "report_deleted",
      entityType: "report",
      entityId: reportId,
    });

    res.json({ success: true, message: "Report deleted successfully" });
  }
);
