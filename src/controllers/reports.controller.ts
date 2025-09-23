import type { Request, Response } from 'express';
import { pool } from '../config/db.js';
import { supabase, SUPABASE_BUCKET } from '../config/supabase.js';

export async function createReport(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    const userId = (req as any).user.id;
    const { latitude, longitude, description } = req.body;
    const files = (req as any).files as Express.Multer.File[];

    await client.query('BEGIN');

    const { rows: reportRows } = await client.query(
      `INSERT INTO reports (user_id, latitude, longitude, location, description)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($2, $3), 4326), $4)
       RETURNING *`,
      [userId, latitude, longitude, description]
    );
    const report = reportRows[0];

    const uploads: any[] = [];
    for (const file of files) {
      const filename = `${report.id}/${Date.now()}-${file.originalname}`;
      const { error } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .upload(filename, file.buffer, { contentType: file.mimetype });
      if (error) throw error;

      const publicUrl = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(filename).data.publicUrl;

      const { rows: uploadRows } = await client.query(
        `INSERT INTO report_uploads (report_id, filename) VALUES ($1, $2) RETURNING *`,
        [report.id, publicUrl]
      );
      uploads.push(uploadRows[0]);
    }

    await client.query('COMMIT');
    res.status(201).json({ report, uploads });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to create report' });
  } finally {
    client.release();
  }
}


export async function getMyReports(req: Request, res: Response) {
  const userId = (req as any).user.id;

  try {
    const { rows: reports } = await pool.query(
      `
      SELECT 
        r.id,
        r.latitude,
        r.longitude,
        r.description,
        r.is_classified,
        r.created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id', ru.id,
              'url', ru.filename,
              'is_fake', ru.is_fake,
              'is_spam', ru.is_spam,
              'uploaded_at', ru.uploaded_at
            )
          ) FILTER (WHERE ru.id IS NOT NULL), '[]'
        ) AS uploads
      FROM reports r
      LEFT JOIN report_uploads ru ON ru.report_id = r.id
      WHERE r.user_id = $1
      GROUP BY r.id
      ORDER BY r.created_at DESC;
      `,
      [userId]
    );

    res.json({ reports });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch reports', details: err.message });
  }
}
