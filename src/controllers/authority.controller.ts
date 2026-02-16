import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { db } from "../config/db.js";
import {
  authorities,
  higherAuthorities,
  refreshTokens,
  auditLogs,
} from "../database/schema.js";
import { generateAccessToken, generateRefreshToken } from "../utils/jwt.js";
import { asyncHandler } from "../middleware/error-handler.js";

// ─── Register Lower Authority (by Higher Authority) ─────────────────────────

export const registerLowerAuthority = asyncHandler(
  async (req: Request, res: Response) => {
    const { email } = req.body;
    const user = req.user!;
    const department = user.department;

    if (!email) {
      return res
        .status(400)
        .json({ success: false, error: "Email is required" });
    }
    if (!department) {
      return res.status(400).json({
        success: false,
        error: "Department missing from higher authority token",
      });
    }

    // Generate temp password from first 6 chars of email
    let tempPassword = email.slice(0, 6);
    if (tempPassword.length < 6) {
      tempPassword = tempPassword.padEnd(6, "0");
    }

    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const [authority] = await db
      .insert(authorities)
      .values({ email, passwordHash, department })
      .returning({
        id: authorities.id,
        email: authorities.email,
        department: authorities.department,
      });

    // Audit log
    await db.insert(auditLogs).values({
      actorId: user.id,
      actorRole: user.role,
      action: "authority_registered",
      entityType: "authority",
      entityId: authority!.id,
      metadata: JSON.stringify({ department }),
    });

    res.status(201).json({
      success: true,
      data: { authority, tempPassword },
      message: "Lower authority registered successfully",
    });
  }
);

// ─── Authority Login (Higher or Lower) ──────────────────────────────────────

export const loginAuthority = asyncHandler(
  async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, error: "Email and password are required" });
    }

    // Try higher authority first
    let [higherAuth] = await db
      .select()
      .from(higherAuthorities)
      .where(eq(higherAuthorities.email, email))
      .limit(1);

    let role: "higher" | "authority";
    let foundUser: any;

    if (higherAuth) {
      role = "higher";
      foundUser = higherAuth;
    } else {
      const [auth] = await db
        .select()
        .from(authorities)
        .where(eq(authorities.email, email))
        .limit(1);

      if (!auth) {
        return res
          .status(401)
          .json({ success: false, error: "Invalid email or password" });
      }
      role = "authority";
      foundUser = auth;
    }

    const valid = await bcrypt.compare(password, foundUser.passwordHash);
    if (!valid) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid email or password" });
    }

    const payload = {
      id: foundUser.id,
      email: foundUser.email,
      role,
      department: foundUser.department,
    };
    const accessToken = generateAccessToken(payload);
    const refreshTkn = generateRefreshToken(payload);

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db
      .insert(refreshTokens)
      .values({ userId: foundUser.id, token: refreshTkn, expiresAt });

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken: refreshTkn,
        user: {
          id: foundUser.id,
          email: foundUser.email,
          role,
          department: foundUser.department,
          isInitialized:
            role === "authority" ? foundUser.isInitialized : undefined,
        },
      },
    });
  }
);

// ─── Update Authority Profile ───────────────────────────────────────────────

export const updateAuthorityProfile = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { name, phone, latitude, longitude, newPassword } = req.body;

    let passwordHash: string | undefined;
    if (newPassword) {
      passwordHash = await bcrypt.hash(newPassword, 12);
    }

    // Build update object
    const updateData: any = { isInitialized: true, updatedAt: new Date() };
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;
    if (latitude !== undefined) updateData.latitude = latitude;
    if (longitude !== undefined) updateData.longitude = longitude;
    if (passwordHash) updateData.passwordHash = passwordHash;

    const [updated] = await db
      .update(authorities)
      .set(updateData)
      .where(eq(authorities.id, userId))
      .returning({
        id: authorities.id,
        name: authorities.name,
        email: authorities.email,
        department: authorities.department,
        latitude: authorities.latitude,
        longitude: authorities.longitude,
        isInitialized: authorities.isInitialized,
      });

    if (!updated) {
      return res
        .status(404)
        .json({ success: false, error: "Authority not found" });
    }

    // Update PostGIS location column via raw SQL
    if (latitude !== undefined && longitude !== undefined) {
      const { pool } = await import("../config/db.js");
      await pool.query(
        `UPDATE authorities SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326) WHERE id = $3`,
        [longitude, latitude, userId]
      );
    }

    // Audit log
    await db.insert(auditLogs).values({
      actorId: userId,
      actorRole: "authority",
      action: "authority_profile_updated",
      entityType: "authority",
      entityId: userId,
    });

    res.json({
      success: true,
      data: updated,
      message: "Profile updated successfully",
    });
  }
);

// ─── Get Authority Profile ──────────────────────────────────────────────────

export const getAuthorityProfile = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const role = req.user!.role;

    if (role === "higher") {
      const [profile] = await db
        .select({
          id: higherAuthorities.id,
          name: higherAuthorities.name,
          email: higherAuthorities.email,
          phone: higherAuthorities.phone,
          department: higherAuthorities.department,
          createdAt: higherAuthorities.createdAt,
        })
        .from(higherAuthorities)
        .where(eq(higherAuthorities.id, userId))
        .limit(1);

      if (!profile) {
        return res
          .status(404)
          .json({ success: false, error: "Profile not found" });
      }

      return res.json({ success: true, data: { ...profile, role: "higher" } });
    }

    const [profile] = await db
      .select({
        id: authorities.id,
        name: authorities.name,
        email: authorities.email,
        phone: authorities.phone,
        department: authorities.department,
        latitude: authorities.latitude,
        longitude: authorities.longitude,
        isInitialized: authorities.isInitialized,
        createdAt: authorities.createdAt,
      })
      .from(authorities)
      .where(eq(authorities.id, userId))
      .limit(1);

    if (!profile) {
      return res
        .status(404)
        .json({ success: false, error: "Profile not found" });
    }

    res.json({ success: true, data: { ...profile, role: "authority" } });
  }
);
