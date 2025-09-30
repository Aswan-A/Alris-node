import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../config/db.js';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt.js';


/**
 * Higher authority registers lower authority
 * Only email is provided, password generated automatically
 */
export async function registerLowerAuthority(req: Request, res: Response) {
  const { email } = req.body;
  const user = (req as any).user; 
  const department = user?.department;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  if (!department) {
    return res.status(400).json({ error: 'Department missing from higher authority token' });
  }

  try {
    // Generate password from first 6 letters of email
    let tempPassword = email.slice(0, 6);
    if (tempPassword.length < 6) {
      tempPassword = tempPassword.padEnd(6, '0');
    }

    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const { rows } = await pool.query(
      `INSERT INTO authorities (email, password_hash, department)
       VALUES ($1, $2, $3)
       RETURNING id, email, department`,
      [email, hashedPassword, department]
    );

    res.status(201).json({
      message: 'Lower authority registered successfully',
      authority: rows[0],
      tempPassword, // return so higher authority can share with them
    });
  } catch (err: any) {
    res.status(400).json({
      error: 'Error registering lower authority',
      details: err.message,
    });
  }
}


/**
 * Authority login (lower or higher)
 * Lower authority also gets is_initialized flag
 */
export async function loginAuthority(req: Request, res: Response) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    let query = `SELECT id, email, password_hash, department FROM higherauthorities WHERE email = $1`;
    let { rows } = await pool.query(query, [email]);

    let role: 'higher' | 'authority' | null = null;
    let user = rows[0];

    if (user) {
      role = 'higher';
    } else {
      query = `SELECT id, email, password_hash, department FROM authorities WHERE email = $1`;
      ({ rows } = await pool.query(query, [email]));
      user = rows[0];
      if (user) role = 'authority';
    }

    if (!user || !role) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const payload = { id: user.id, role, department: user.department };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token) VALUES ($1, $2)`,
      [user.id, refreshToken]
    );

    res.json({
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role,
        department: user.department,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Login error', details: err.message });
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

