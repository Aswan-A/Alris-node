import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../config/db.js';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt.js';

// Generate random alphanumeric password
function generateRandomPassword(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

/**
 * Higher authority registers lower authority
 * Only email is provided, password generated automatically
 */
export async function registerLowerAuthority(req: Request, res: Response) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const tempPassword = generateRandomPassword(6);
  const hashedPassword = await bcrypt.hash(tempPassword, 10);

  try {
    const { rows } = await pool.query(
      `INSERT INTO authorities (email, password_hash, is_initialized, latitude, longitude, location, department)
       VALUES ($1, $2, false, 0, 0, ST_SetSRID(ST_MakePoint(0,0),4326), '')
       RETURNING id, email`,
      [email, hashedPassword]
    );

    res.status(201).json({
      message: 'Lower authority registered successfully',
      authority: rows[0],
      tempPassword
    });
  } catch (err: any) {
    res.status(400).json({ error: 'Error registering lower authority', details: err.message });
  }
}

/**
 * Authority login (lower or higher)
 * Lower authority also gets is_initialized flag
 */
export async function loginAuthority(req: Request, res: Response) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const { rows } = await pool.query(`SELECT * FROM authorities WHERE email=$1`, [email]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const authority = rows[0];
    const match = await bcrypt.compare(password, authority.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const role = authority.is_initialized ? 'authority' : 'authority';
    const payload = { id: authority.id, email: authority.email, role };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await pool.query(`INSERT INTO refresh_tokens (user_id, token) VALUES ($1, $2)`, [
      authority.id,
      refreshToken
    ]);

    res.json({
      accessToken,
      refreshToken,
      is_initialized: authority.is_initialized
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Login failed', details: err.message });
  }
}

/**
 * Lower authority updates profile and password
 * After update, is_initialized = true
 */
export async function updateAuthorityProfile(req: Request, res: Response) {
  // Cast req to any to access user attached by authMiddleware
  const user = (req as any).user;
  const { id } = user;
  const { name, phone, department, latitude, longitude, newPassword } = req.body;

  try {
    let hashedPassword: string | undefined;
    if (newPassword) {
      hashedPassword = await bcrypt.hash(newPassword, 10);
    }

    const { rows } = await pool.query(
      `UPDATE authorities
       SET name = COALESCE($1,name),
           phone = COALESCE($2,phone),
           department = COALESCE($3,department),
           latitude = COALESCE($4,latitude),
           longitude = COALESCE($5,longitude),
           location = ST_SetSRID(ST_MakePoint(COALESCE($5,longitude), COALESCE($4,latitude)),4326),
           password_hash = COALESCE($6,password_hash),
           is_initialized = true
       WHERE id=$7
       RETURNING id,name,email,department,latitude,longitude,is_initialized`,
      [name, phone, department, latitude, longitude, hashedPassword, id]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Authority not found' });

    res.json({ message: 'Profile updated successfully', authority: rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: 'Error updating profile', details: err.message });
  }
}

