import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { db } from "../config/db.js";
import { users, refreshTokens } from "../database/schema.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt.js";
import { asyncHandler } from "../middleware/error-handler.js";

// ─── Register ───────────────────────────────────────────────────────────────

export const registerUser = asyncHandler(
  async (req: Request, res: Response) => {
    const { name, email, phone, password } = req.body;

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing.length > 0) {
      return res
        .status(409)
        .json({ success: false, error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [user] = await db
      .insert(users)
      .values({ name, email, phone, passwordHash })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        trustScore: users.trustScore,
      });

    res.status(201).json({
      success: true,
      data: user,
      message: "User registered successfully",
    });
  }
);

// ─── Login ──────────────────────────────────────────────────────────────────

export const loginUser = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    return res
      .status(401)
      .json({ success: false, error: "Invalid credentials" });
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return res
      .status(401)
      .json({ success: false, error: "Invalid credentials" });
  }

  const payload = { id: user.id, email: user.email, role: "citizen" as const };
  const accessToken = generateAccessToken(payload);
  const refreshTkn = generateRefreshToken(payload);

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await db
    .insert(refreshTokens)
    .values({ userId: user.id, token: refreshTkn, expiresAt });

  res.json({
    success: true,
    data: {
      accessToken,
      refreshToken: refreshTkn,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        trustScore: user.trustScore,
        isFlagged: user.isFlagged,
        totalReports: user.totalReports,
      },
    },
  });
});

// ─── Refresh Token ──────────────────────────────────────────────────────────

export const refreshAccessToken = asyncHandler(
  async (req: Request, res: Response) => {
    const { token } = req.body;
    if (!token) {
      return res
        .status(401)
        .json({ success: false, error: "No refresh token provided" });
    }

    try {
      const decoded = verifyRefreshToken(token) as any;
      const accessToken = generateAccessToken({
        id: decoded.id,
        email: decoded.email,
        role: decoded.role,
      });
      res.json({ success: true, data: { accessToken } });
    } catch {
      res
        .status(403)
        .json({ success: false, error: "Invalid refresh token" });
    }
  }
);

// ─── Get Profile ────────────────────────────────────────────────────────────

export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      avatarUrl: users.avatarUrl,
      trustScore: users.trustScore,
      isFlagged: users.isFlagged,
      totalReports: users.totalReports,
      totalUpvotes: users.totalUpvotes,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }

  res.json({ success: true, data: user });
});

// ─── Logout ─────────────────────────────────────────────────────────────────

export const logoutUser = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body;
  if (token) {
    await db.delete(refreshTokens).where(eq(refreshTokens.token, token));
  }
  res.json({ success: true, message: "Logged out successfully" });
});