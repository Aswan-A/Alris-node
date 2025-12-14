import type { Request, Response } from 'express';
import { pool } from '../config/db.js';

// Issues near authority location
export async function getNearbyIssues(req: Request, res: Response) {
  const user = (req as any).user;
  const userId = user.id;
  const userRole = user.role;

  const radiusKm = parseFloat(req.query.radius as string) || 10;
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;

  let location: any;
  let department: string | null = null;

  try {
    if (userRole === "authority") {
      const { rows: authRows } = await pool.query(
        `SELECT location, department FROM authorities WHERE id=$1`,
        [userId]
      );

      if (authRows.length === 0) {
        return res.status(404).json({ error: "Authority not found" });
      }

      location = authRows[0].location; 
      department = authRows[0].department;
    }
    else if (userRole === "citizen") {
      const { latitude, longitude } = req.body;

      if (!latitude || !longitude) {
        return res.status(400).json({
          error: "Latitude and longitude are required for citizens",
        });
      }

      const { rows: locRows } = await pool.query(
        `SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326) AS location`,
        [longitude, latitude]
      );

      location = locRows[0].location;
      department = null;
    }
    else {
      return res.status(403).json({ error: "Invalid user role" });
    }

    const radiusMeters = radiusKm * 1000;

    let countQuery;
    let countParams;

    if (department) {
      countQuery = `
        SELECT COUNT(*) AS total
        FROM issues
        WHERE department = $1
          AND ST_DWithin(location::geography, $2::geography, $3)
      `;
      countParams = [department, location, radiusMeters];
    } else {
      countQuery = `
        SELECT COUNT(*) AS total
        FROM issues
        WHERE ST_DWithin(location::geography, $1::geography, $2)
      `;
      countParams = [location, radiusMeters];
    }

    const { rows: countRows } = await pool.query(countQuery, countParams);
    const total = parseInt(countRows[0].total);

    let issueQuery;
    let issueParams;

    if (department) {
      issueQuery = `
        SELECT
          i.id AS issue_id,
          i.latitude,
          i.longitude,
          i.category,
          i.department,
          i.status,
          i.created_at,
          i.updated_at,
          ST_Distance(i.location::geography, $1::geography) AS distance_meters,
          ROUND((ST_Distance(i.location::geography, $1::geography) / 1000)::numeric, 2) AS distance_km,
          COALESCE(
            json_agg(
              json_build_object(
                'report_id', r.id,
                'user_id', r.user_id,
                'description', r.description,
                'created_at', r.created_at,
                'uploads', (
                  SELECT COALESCE(
                    json_agg(
                      json_build_object(
                        'id', ru.id,
                        'url', ru.filename,
                        'uploaded_at', ru.uploaded_at,
                        'is_fake', ru.is_fake,
                        'is_spam', ru.is_spam
                      )
                    ), '[]'::json
                  )
                  FROM report_uploads ru
                  WHERE ru.report_id = r.id
                )
              )
            ) FILTER (WHERE r.id IS NOT NULL), '[]'
          ) AS reports
        FROM issues i
        LEFT JOIN reports r ON r.issue_id = i.id AND r.is_classified = true
        WHERE i.department = $2
          AND ST_DWithin(i.location::geography, $1::geography, $3)
        GROUP BY i.id
        ORDER BY i.location <-> $1
        LIMIT $4 OFFSET $5
      `;
      issueParams = [location, department, radiusMeters, limit, offset];
    } else {
      issueQuery = `
        SELECT
          i.id AS issue_id,
          i.latitude,
          i.longitude,
          i.category,
          i.department,
          i.status,
          i.created_at,
          i.updated_at,
          ST_Distance(i.location::geography, $1::geography) AS distance_meters,
          ROUND((ST_Distance(i.location::geography, $1::geography) / 1000)::numeric, 2) AS distance_km,
          COALESCE(
            json_agg(
              json_build_object(
                'report_id', r.id,
                'user_id', r.user_id,
                'description', r.description,
                'created_at', r.created_at,
                'uploads', (
                  SELECT COALESCE(
                    json_agg(
                      json_build_object(
                        'id', ru.id,
                        'url', ru.filename,
                        'uploaded_at', ru.uploaded_at,
                        'is_fake', ru.is_fake,
                        'is_spam', ru.is_spam
                      )
                    ), '[]'::json
                  )
                  FROM report_uploads ru
                  WHERE ru.report_id = r.id
                )
              )
            ) FILTER (WHERE r.id IS NOT NULL), '[]'
          ) AS reports
        FROM issues i
        LEFT JOIN reports r ON r.issue_id = i.id AND r.is_classified = true
        WHERE ST_DWithin(i.location::geography, $1::geography, $2)
        GROUP BY i.id
        ORDER BY i.location <-> $1
        LIMIT $3 OFFSET $4
      `;
      issueParams = [location, radiusMeters, limit, offset];
    }

    const { rows: issues } = await pool.query(issueQuery, issueParams);
    
    res.json({
      issues,
      total,
      limit,
      offset,
      hasMore: offset + issues.length < total,
    });

  } catch (err: any) {
    console.error(err);
    res.status(500).json({
      error: "Failed to fetch nearby issues",
      details: err.message,
    });
  }
}


// Issues for higher authority by department
export async function getDepartmentIssues(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const department = user.department;

    if (!department) {
      return res.status(400).json({ error: 'Department not found in token' });
    }

    const { rows: issues } = await pool.query(
      `
      SELECT 
        i.id AS issue_id,
        i.latitude,
        i.longitude,
        i.category,
        i.department,
        i.status,
        i.created_at,
        i.updated_at,
        COALESCE(
          json_agg(
            json_build_object(
              'report_id', r.id,
              'user_id', r.user_id,
              'description', r.description,
              'created_at', r.created_at,
              'uploads', (
                SELECT COALESCE(
                  json_agg(
                    json_build_object(
                      'id', ru.id,
                      'url', ru.filename,
                      'uploaded_at', ru.uploaded_at,
                      'is_fake', ru.is_fake,
                      'is_spam', ru.is_spam
                    )
                  ), '[]'::json
                )
                FROM report_uploads ru
                WHERE ru.report_id = r.id
              )
            )
          ) FILTER (WHERE r.id IS NOT NULL), '[]'
        ) AS reports
      FROM issues i
      LEFT JOIN reports r ON r.issue_id = i.id AND r.is_classified = true
      WHERE i.department = $1
      GROUP BY i.id
      ORDER BY i.created_at DESC;
      `,
      [department]
    );

    res.json({ issues });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch issues', details: err.message });
  }
}


// Get single issue details by ID
export async function getIssueById(req: Request, res: Response) {
  try {
    const { issueId } = req.params;
    const user = (req as any).user;

    if (!issueId) {
      return res.status(400).json({ error: 'Issue ID is required' });
    }

    // Query to get issue with all its reports and uploads
    const { rows } = await pool.query(
      `
      SELECT 
        i.id AS issue_id,
        i.latitude,
        i.longitude,
        i.category,
        i.department,
        i.status,
        i.created_at,
        i.updated_at,
        COALESCE(
          json_agg(
            json_build_object(
              'report_id', r.id,
              'user_id', r.user_id,
              'description', r.description,
              'latitude', r.latitude,
              'longitude', r.longitude,
              'created_at', r.created_at,
              'uploads', (
                SELECT COALESCE(
                  json_agg(
                    json_build_object(
                      'id', ru.id,
                      'url', ru.filename,
                      'uploaded_at', ru.uploaded_at,
                      'is_fake', ru.is_fake,
                      'is_spam', ru.is_spam
                    )
                  ), '[]'::json
                )
                FROM report_uploads ru
                WHERE ru.report_id = r.id
              )
            )
          ) FILTER (WHERE r.id IS NOT NULL), '[]'
        ) AS reports
      FROM issues i
      LEFT JOIN reports r ON r.issue_id = i.id AND r.is_classified = true
      WHERE i.id = $1
      GROUP BY i.id;
      `,
      [issueId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    res.json({ issue: rows[0] });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ 
      error: 'Failed to fetch issue details', 
      details: err.message 
    });
  }
}


export async function updateIssueStatus(req: Request, res: Response) {
  try {
    const { issueId, status } = req.body;

    if (!issueId || !status) {
      return res.status(400).json({ error: 'issueId and status are required' });
    }

    // Validate status
    const validStatuses = ['submitted', 'ongoing', 'resolved', 'rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
    }

    // Update issue
    const { rows } = await pool.query(
      `UPDATE issues
       SET status = $1, updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [status, issueId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    res.json({
      message: 'Issue status updated successfully',
      issue: rows[0],
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update issue status', details: err.message });
  }
}