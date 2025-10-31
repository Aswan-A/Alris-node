import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../config/db.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt.js';

export async function registerUser(req: Request, res: Response) {
  const { name, email, phone, password } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, name, email`,
      [name, email, phone, hashed]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: 'User already exists' });
  }
}

export async function loginUser(req: Request, res: Response) {
  try {
    const { email, password } = req.body;
    const { rows } = await pool.query(`SELECT * FROM users WHERE email=$1`, [email]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const payload = { id: user.id, email: user.email, role: 'citizen' };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await pool.query(`INSERT INTO refresh_tokens (user_id, token) VALUES ($1, $2)`, [user.id, refreshToken]);

    res.json({ accessToken, refreshToken });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
}

export async function refreshToken(req: Request, res: Response) {
  const { token } = req.body;
  if (!token) return res.status(401).json({ error: 'No refresh token' });

  try {
    const decoded = verifyRefreshToken(token) as any;
    const accessToken = generateAccessToken({ id: decoded.id, email: decoded.email, role: decoded.role });
    res.json({ accessToken });
  } catch {
    res.status(403).json({ error: 'Invalid refresh token' });
  }
}