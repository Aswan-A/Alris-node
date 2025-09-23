import type { Request, Response } from 'express';
import { pool } from '../config/db.js';

// Issues near authority location
export async function getNearbyIssues(req: Request, res: Response) {
  const authorityId = (req as any).user.id;
  const { rows: authRows } = await pool.query(`SELECT location, department FROM authorities WHERE id=$1`, [authorityId]);
  if (authRows.length === 0) return res.status(404).json({ error: 'Authority not found' });

  const { location, department } = authRows[0];

  const { rows: issues } = await pool.query(
    `SELECT *, ST_Distance(location, $1) AS distance
     FROM issues
     WHERE department=$2
     ORDER BY location <-> $1
     LIMIT 20`,
    [location, department]
  );

  res.json(issues);
}

// Issues for higher authority by department
export async function getDepartmentIssues(req: Request, res: Response) {
  const higherId = (req as any).user.id;
  const { rows: higherRows } = await pool.query(`SELECT department FROM higherauthorities WHERE id=$1`, [higherId]);
  if (higherRows.length === 0) return res.status(404).json({ error: 'Higher authority not found' });

  const { department } = higherRows[0];
  const { rows: issues } = await pool.query(`SELECT * FROM issues WHERE department=$1`, [department]);
  res.json(issues);
}
