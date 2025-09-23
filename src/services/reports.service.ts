import { pool } from '../config/db.js';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export async function createReport(userId: string, description: string) {
  const { rows } = await pool.query(
    `INSERT INTO reports (user_id, description) VALUES ($1,$2) RETURNING *`,
    [userId, description]
  );
  return rows[0];
}

export async function addUpload(reportId: string, fileBuffer: Buffer, originalName: string) {
  const filename = `${uuidv4()}_${originalName}`;
  const filepath = path.join(UPLOAD_DIR, filename);
  await fs.promises.writeFile(filepath, fileBuffer);
  const fileUrl = `/uploads/${filename}`; // you can serve statically from /uploads
  const { rows } = await pool.query(
    `INSERT INTO report_uploads (report_id, filename) VALUES ($1,$2) RETURNING *`,
    [reportId, fileUrl]
  );
  return rows[0];
}

export async function getUnclassifiedReports(limit = 200) {
  const { rows } = await pool.query(
    `SELECT * FROM reports WHERE is_classified = false ORDER BY created_at ASC LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function getReportUploads(reportIds: string[]) {
  if (!reportIds.length) return [];
  const { rows } = await pool.query(
    `SELECT * FROM report_uploads WHERE report_id = ANY($1::uuid[])`,
    [reportIds]
  );
  return rows;
}

export async function getReportsByUser(userId: string) {
  const { rows } = await pool.query(
    `SELECT r.*, COALESCE(json_agg(ru.*) FILTER (WHERE ru.id IS NOT NULL), '[]') AS uploads
     FROM reports r
     LEFT JOIN report_uploads ru ON ru.report_id = r.id AND ru.is_fake = false AND ru.is_spam = false
     WHERE r.user_id = $1
     GROUP BY r.id ORDER BY r.created_at DESC`,
    [userId]
  );
  return rows;
}

export async function getIssuesForAuthority(department: string, lat?: number, lon?: number, radiusKm = 10) {
  if (lat == null || lon == null) {
    const { rows } = await pool.query(
      `SELECT * FROM issues WHERE department = $1 ORDER BY created_at DESC`,
      [department]
    );
    return rows;
  }

  // use PostGIS ST_DWithin with geography to compare meters (radiusKm * 1000)
  const radiusMeters = radiusKm * 1000;
  const { rows } = await pool.query(
    `SELECT *, ST_Distance(location::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) as distance_m
     FROM issues
     WHERE department = $3 AND ST_DWithin(location::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $4)
     ORDER BY distance_m ASC, created_at DESC`,
    [lon, lat, department, radiusMeters]
  );
  return rows;
}

export async function getIssueDetails(issueId: string) {
  const { rows } = await pool.query(`SELECT * FROM issues WHERE id=$1`, [issueId]);
  if (!rows.length) return null;
  const issue = rows[0];
  const { rows: reports } = await pool.query(
    `SELECT r.*, COALESCE(json_agg(ru.*) FILTER (WHERE ru.id IS NOT NULL), '[]') AS uploads
     FROM reports r
     LEFT JOIN report_uploads ru ON ru.report_id = r.id AND ru.is_fake=false AND ru.is_spam=false
     WHERE r.issue_id = $1
     GROUP BY r.id
     ORDER BY r.created_at DESC`,
    [issueId]
  );
  return { issue, reports };
}

export async function updateIssueStatus(issueId: string, status: string) {
  const { rows } = await pool.query(
    `UPDATE issues SET status=$1, updated_at = now() WHERE id=$2 RETURNING *`,
    [status, issueId]
  );
  return rows[0];
}
