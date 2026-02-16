import type { Request, Response } from "express";
import { eq, sql, and } from "drizzle-orm";
import { db, pool } from "../config/db.js";
import {
  issues,
  issueUpvotes,
  users,
  auditLogs,
} from "../database/schema.js";
import { asyncHandler } from "../middleware/error-handler.js";

// ─── Nearby Issues ──────────────────────────────────────────────────────────

export const getNearbyIssues = asyncHandler(
  async (req: Request, res: Response) => {
    const user = req.user!;
    const userId = user.id;
    const userRole = user.role;

    const radiusKm = parseFloat(req.query.radius as string) || 10;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    let location: any;
    let department: string | null = null;

    if (userRole === "authority") {
      const { rows: authRows } = await pool.query(
        `SELECT location, department FROM authorities WHERE id=$1`,
        [userId]
      );
      if (authRows.length === 0) {
        return res
          .status(404)
          .json({ success: false, error: "Authority not found" });
      }
      location = authRows[0]!.location;
      department = authRows[0]!.department;
    } else if (userRole === "citizen") {
      const { latitude, longitude } = req.query as any;
      if (!latitude || !longitude) {
        return res.status(400).json({
          success: false,
          error: "Latitude and longitude query params are required for citizens",
        });
      }
      const { rows: locRows } = await pool.query(
        `SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326) AS location`,
        [longitude, latitude]
      );
      location = locRows[0]!.location;
    } else {
      return res.status(403).json({ success: false, error: "Invalid role" });
    }

    const radiusMeters = radiusKm * 1000;

    // Count
    const countQuery = department
      ? `SELECT COUNT(*) AS total FROM issues WHERE department = $1 AND ST_DWithin(location::geography, $2::geography, $3)`
      : `SELECT COUNT(*) AS total FROM issues WHERE ST_DWithin(location::geography, $1::geography, $2)`;
    const countParams = department
      ? [department, location, radiusMeters]
      : [location, radiusMeters];

    const { rows: countRows } = await pool.query(countQuery, countParams);
    const total = parseInt(countRows[0]!.total);

    // Issues with reports + uploads
    const baseSelect = `
      SELECT
        i.id AS issue_id, i.latitude, i.longitude, i.category, i.department,
        i.status, i.priority, i.upvote_count, i.report_count,
        i.created_at, i.updated_at,
        ST_Distance(i.location::geography, $1::geography) AS distance_meters,
        ROUND((ST_Distance(i.location::geography, $1::geography) / 1000)::numeric, 2) AS distance_km,
        COALESCE(
          json_agg(
            json_build_object(
              'report_id', r.id, 'user_id', r.user_id, 'description', r.description,
              'created_at', r.created_at,
              'uploads', (
                SELECT COALESCE(
                  json_agg(json_build_object(
                    'id', ru.id, 'url', ru.filename, 'uploaded_at', ru.uploaded_at,
                    'is_fake', ru.is_fake, 'is_spam', ru.is_spam
                  )), '[]'::json
                ) FROM report_uploads ru WHERE ru.report_id = r.id
              )
            )
          ) FILTER (WHERE r.id IS NOT NULL), '[]'
        ) AS reports
      FROM issues i
      LEFT JOIN reports r ON r.issue_id = i.id AND r.is_classified = true
    `;

    let issueQuery: string;
    let issueParams: any[];

    if (department) {
      issueQuery = `${baseSelect}
        WHERE i.department = $2 AND ST_DWithin(i.location::geography, $1::geography, $3)
        GROUP BY i.id ORDER BY i.location <-> $1 LIMIT $4 OFFSET $5`;
      issueParams = [location, department, radiusMeters, limit, offset];
    } else {
      issueQuery = `${baseSelect}
        WHERE ST_DWithin(i.location::geography, $1::geography, $2)
        GROUP BY i.id ORDER BY i.location <-> $1 LIMIT $3 OFFSET $4`;
      issueParams = [location, radiusMeters, limit, offset];
    }

    const { rows: issueRows } = await pool.query(issueQuery, issueParams);

    res.json({
      success: true,
      data: {
        issues: issueRows,
        total,
        limit,
        offset,
        hasMore: offset + issueRows.length < total,
      },
    });
  }
);

// ─── Department Issues (for Higher Authority) ───────────────────────────────

export const getDepartmentIssues = asyncHandler(
  async (req: Request, res: Response) => {
    const department = req.user!.department;
    if (!department) {
      return res.status(400).json({
        success: false,
        error: "Department not found in token",
      });
    }

    const status = req.query.status as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    let query = `
      SELECT 
        i.id AS issue_id, i.latitude, i.longitude, i.category, i.department,
        i.status, i.priority, i.upvote_count, i.report_count,
        i.created_at, i.updated_at,
        COALESCE(
          json_agg(
            json_build_object(
              'report_id', r.id, 'user_id', r.user_id, 'description', r.description,
              'created_at', r.created_at,
              'uploads', (
                SELECT COALESCE(
                  json_agg(json_build_object(
                    'id', ru.id, 'url', ru.filename, 'uploaded_at', ru.uploaded_at,
                    'is_fake', ru.is_fake, 'is_spam', ru.is_spam
                  )), '[]'::json
                ) FROM report_uploads ru WHERE ru.report_id = r.id
              )
            )
          ) FILTER (WHERE r.id IS NOT NULL), '[]'
        ) AS reports
      FROM issues i
      LEFT JOIN reports r ON r.issue_id = i.id AND r.is_classified = true
      WHERE i.department = $1`;

    const params: any[] = [department];

    if (status) {
      params.push(status);
      query += ` AND i.status = $${params.length}`;
    }

    query += ` GROUP BY i.id ORDER BY i.priority DESC, i.created_at DESC`;
    params.push(limit, offset);
    query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const { rows } = await pool.query(query, params);

    // Count
    let countQuery = `SELECT COUNT(*) AS total FROM issues WHERE department = $1`;
    const countParams: any[] = [department];
    if (status) {
      countParams.push(status);
      countQuery += ` AND status = $${countParams.length}`;
    }
    const { rows: countRows } = await pool.query(countQuery, countParams);
    const total = parseInt(countRows[0]!.total);

    res.json({
      success: true,
      data: {
        issues: rows,
        total,
        limit,
        offset,
        hasMore: offset + rows.length < total,
      },
    });
  }
);

// ─── Get Issue by ID ────────────────────────────────────────────────────────

export const getIssueById = asyncHandler(
  async (req: Request, res: Response) => {
    const issueId = req.params["issueId"]!;

    const { rows } = await pool.query(
      `SELECT 
        i.id AS issue_id, i.latitude, i.longitude, i.category, i.department,
        i.status, i.priority, i.upvote_count, i.report_count, i.description,
        i.created_at, i.updated_at, i.resolved_at,
        COALESCE(
          json_agg(
            json_build_object(
              'report_id', r.id, 'user_id', r.user_id, 'description', r.description,
              'latitude', r.latitude, 'longitude', r.longitude,
              'created_at', r.created_at,
              'uploads', (
                SELECT COALESCE(
                  json_agg(json_build_object(
                    'id', ru.id, 'url', ru.filename, 'uploaded_at', ru.uploaded_at,
                    'is_fake', ru.is_fake, 'is_spam', ru.is_spam
                  )), '[]'::json
                ) FROM report_uploads ru WHERE ru.report_id = r.id
              )
            )
          ) FILTER (WHERE r.id IS NOT NULL), '[]'
        ) AS reports
      FROM issues i
      LEFT JOIN reports r ON r.issue_id = i.id AND r.is_classified = true
      WHERE i.id = $1
      GROUP BY i.id`,
      [issueId]
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Issue not found" });
    }

    res.json({ success: true, data: { issue: rows[0] } });
  }
);

// ─── Update Issue Status ────────────────────────────────────────────────────

export const updateIssueStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const { issueId, status } = req.body;
    const user = req.user!;

    if (!issueId || !status) {
      return res
        .status(400)
        .json({ success: false, error: "issueId and status are required" });
    }

    const validStatuses = ["submitted", "in_progress", "resolved", "rejected"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Status must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const updateData: Record<string, any> = {
      status,
      updatedAt: new Date(),
    };
    if (status === "resolved") {
      updateData["resolvedAt"] = new Date();
    }

    const updated = await db
      .update(issues)
      .set(updateData)
      .where(eq(issues.id, issueId))
      .returning();

    if (updated.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Issue not found" });
    }

    // Audit log
    await db.insert(auditLogs).values({
      actorId: user.id,
      actorRole: user.role,
      action: "issue_status_updated",
      entityType: "issue",
      entityId: issueId,
      metadata: JSON.stringify({ newStatus: status }),
    });

    res.json({
      success: true,
      data: updated[0],
      message: "Issue status updated successfully",
    });
  }
);

// ─── Upvote Issue ───────────────────────────────────────────────────────────

export const upvoteIssue = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const issueId = req.params["issueId"]!;

    // Check if already upvoted
    const existing = await db
      .select()
      .from(issueUpvotes)
      .where(
        and(
          eq(issueUpvotes.issueId, issueId),
          eq(issueUpvotes.userId, userId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return res
        .status(409)
        .json({ success: false, error: "Already upvoted this issue" });
    }

    await db.insert(issueUpvotes).values({ issueId, userId });

    // Increment upvote count on issue
    await db
      .update(issues)
      .set({
        upvoteCount: sql`${issues.upvoteCount} + 1`,
        priority: sql`${issues.priority} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(issues.id, issueId));

    // Increment user's total upvotes
    await db
      .update(users)
      .set({ totalUpvotes: sql`${users.totalUpvotes} + 1` })
      .where(eq(users.id, userId));

    res.json({ success: true, message: "Issue upvoted" });
  }
);

// ─── Remove Upvote ──────────────────────────────────────────────────────────

export const removeUpvote = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const issueId = req.params["issueId"]!;

    const existing = await db
      .select()
      .from(issueUpvotes)
      .where(
        and(
          eq(issueUpvotes.issueId, issueId),
          eq(issueUpvotes.userId, userId)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Upvote not found" });
    }

    await db
      .delete(issueUpvotes)
      .where(
        and(
          eq(issueUpvotes.issueId, issueId),
          eq(issueUpvotes.userId, userId)
        )
      );

    // Decrement
    await db
      .update(issues)
      .set({
        upvoteCount: sql`GREATEST(${issues.upvoteCount} - 1, 0)`,
        priority: sql`GREATEST(${issues.priority} - 1, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(issues.id, issueId));

    await db
      .update(users)
      .set({ totalUpvotes: sql`GREATEST(${users.totalUpvotes} - 1, 0)` })
      .where(eq(users.id, userId));

    res.json({ success: true, message: "Upvote removed" });
  }
);