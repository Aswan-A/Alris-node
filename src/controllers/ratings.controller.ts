import type { Request, Response } from "express";
import { eq, sql, avg, desc } from "drizzle-orm";
import { db } from "../config/db.js";
import {
    userRatings,
    users,
    auditLogs,
    notifications,
} from "../database/schema.js";
import { asyncHandler } from "../middleware/error-handler.js";

// ─── Rate User ──────────────────────────────────────────────────────────────

export const rateUser = asyncHandler(async (req: Request, res: Response) => {
    const rater = req.user!;
    const userId = req.params["userId"]!;
    const { rating, comment, reportId } = req.body;

    if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({
            success: false,
            error: "Rating must be between 1 and 5",
        });
    }

    // Verify user exists
    const targetUsers = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    if (targetUsers.length === 0) {
        return res.status(404).json({ success: false, error: "User not found" });
    }

    // Insert rating
    const inserted = await db
        .insert(userRatings)
        .values({
            userId,
            ratedBy: rater.id,
            ratedByRole: rater.role,
            rating: Math.round(rating),
            comment: comment ?? null,
            reportId: reportId ?? null,
        })
        .returning();
    const newRating = inserted[0]!;

    // Recalculate trust score
    const avgResult = await db
        .select({ avgRating: avg(userRatings.rating) })
        .from(userRatings)
        .where(eq(userRatings.userId, userId));

    const newTrustScore = parseFloat(avgResult[0]?.avgRating ?? "3.0");
    const isFlagged = newTrustScore < 2.0;

    // Check previous flag status
    const previousUsers = await db
        .select({ isFlagged: users.isFlagged })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
    const wasFlagged = previousUsers[0]?.isFlagged ?? false;

    await db
        .update(users)
        .set({
            trustScore: newTrustScore,
            isFlagged,
            updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

    // If newly flagged, create notification
    if (isFlagged && !wasFlagged) {
        await db.insert(notifications).values({
            recipientId: userId,
            recipientRole: "citizen",
            type: "user_flagged",
            title: "Account Flagged",
            message:
                "Your account has been flagged due to low trust score. Please ensure your reports are authentic.",
            referenceId: userId,
            referenceType: "user",
        });

        await db.insert(auditLogs).values({
            actorId: rater.id,
            actorRole: rater.role,
            action: "user_flagged",
            entityType: "user",
            entityId: userId,
            metadata: JSON.stringify({ trustScore: newTrustScore }),
        });
    }

    // Audit the rating
    await db.insert(auditLogs).values({
        actorId: rater.id,
        actorRole: rater.role,
        action: "user_rated",
        entityType: "user",
        entityId: userId,
        metadata: JSON.stringify({ rating, comment }),
    });

    // Notify the user
    await db.insert(notifications).values({
        recipientId: userId,
        recipientRole: "citizen",
        type: "user_rated",
        title: "You received a trust rating",
        message: `An authority rated your authenticity: ${rating}/5${comment ? ` — "${comment}"` : ""}`,
        referenceId: newRating.id,
        referenceType: "user",
    });

    res.status(201).json({
        success: true,
        data: {
            rating: newRating,
            updatedTrustScore: newTrustScore,
            isFlagged,
        },
        message: "User rated successfully",
    });
});

// ─── Get User Ratings ───────────────────────────────────────────────────────

export const getUserRatings = asyncHandler(
    async (req: Request, res: Response) => {
        const userId = req.params["userId"]!;

        const userRows = await db
            .select({
                id: users.id,
                name: users.name,
                email: users.email,
                trustScore: users.trustScore,
                isFlagged: users.isFlagged,
                totalReports: users.totalReports,
            })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

        if (userRows.length === 0) {
            return res.status(404).json({ success: false, error: "User not found" });
        }

        const ratings = await db
            .select()
            .from(userRatings)
            .where(eq(userRatings.userId, userId))
            .orderBy(desc(userRatings.createdAt));

        res.json({
            success: true,
            data: {
                user: userRows[0],
                ratings,
                totalRatings: ratings.length,
            },
        });
    }
);

// ─── Get Flagged Users ──────────────────────────────────────────────────────

export const getFlaggedUsers = asyncHandler(
    async (req: Request, res: Response) => {
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;

        const flaggedUsers = await db
            .select({
                id: users.id,
                name: users.name,
                email: users.email,
                phone: users.phone,
                trustScore: users.trustScore,
                isFlagged: users.isFlagged,
                totalReports: users.totalReports,
                createdAt: users.createdAt,
            })
            .from(users)
            .where(eq(users.isFlagged, true))
            .orderBy(users.trustScore)
            .limit(limit)
            .offset(offset);

        const countResult = await db
            .select({ count: sql<number>`cast(count(*) as integer)` })
            .from(users)
            .where(eq(users.isFlagged, true));
        const total = countResult[0]?.count ?? 0;

        res.json({
            success: true,
            data: {
                users: flaggedUsers,
                total,
                limit,
                offset,
                hasMore: offset + flaggedUsers.length < total,
            },
        });
    }
);
