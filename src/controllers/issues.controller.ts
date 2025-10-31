import type { Request, Response } from 'express';
import { pool } from '../config/db.js';

// Issues near authority location
export async function getNearbyIssues(req: Request, res: Response) {
  const authorityId = (req as any).user.id;
  const radiusKm = parseFloat(req.query.radius as string) || 10;
  const limit = parseInt(req.query.limit as string) || 50; // Default 50
  const offset = parseInt(req.query.offset as string) || 0; // For pagination
  
  const { rows: authRows } = await pool.query(
    `SELECT location, department FROM authorities WHERE id=$1`, 
    [authorityId]
  );
  
  if (authRows.length === 0) return res.status(404).json({ error: 'Authority not found' });

  const { location, department } = authRows[0];
  const radiusMeters = radiusKm * 1000;

  // Get total count
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*) as total
     FROM issues
     WHERE department = $1
       AND ST_DWithin(location::geography, $2::geography, $3)`,
    [department, location, radiusMeters]
  );

  const { rows: issues } = await pool.query(
    `SELECT 
       *,
       ST_Distance(location::geography, $1::geography) AS distance_meters,
       ROUND(ST_Distance(location::geography, $1::geography) / 1000, 2) AS distance_km
     FROM issues
     WHERE department = $2
       AND ST_DWithin(location::geography, $1::geography, $3)
     ORDER BY location <-> $1
     LIMIT $4 OFFSET $5`,
    [location, department, radiusMeters, limit, offset]
  );

  res.json({
    issues,
    total: parseInt(countRows[0].total),
    limit,
    offset,
    hasMore: offset + issues.length < parseInt(countRows[0].total)
  });
}

// Issues for higher authority by department
export async function getDepartmentIssues(req: Request, res: Response) {
  try {
    const higherId = (req as any).user.id;

    // Get higher authority department
    const { rows: higherRows } = await pool.query(
      `SELECT department FROM higherauthorities WHERE id = $1`,
      [higherId]
    );
    if (higherRows.length === 0)
      return res.status(404).json({ error: 'Higher authority not found' });

    const { department } = higherRows[0];

    // Get all classified reports for issues in this department
    const { rows: issues } = await pool.query(
      `
      SELECT 
        i.id AS issue_id,
        i.latitude AS issue_latitude,
        i.longitude AS issue_longitude,
        i.status,
        i.category,
        COALESCE(
          json_agg(
            json_build_object(
              'report_id', r.id,
              'description', r.description,
              'uploads', (
                SELECT COALESCE(
                  json_agg(
                    json_build_object(
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
