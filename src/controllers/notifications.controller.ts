import type { Request, Response } from "express";
import { eq, and, sql, desc } from "drizzle-orm";
import { db } from "../config/db.js";
import { notifications } from "../database/schema.js";
import { asyncHandler } from "../middleware/error-handler.js";

// ─── Get My Notifications ───────────────────────────────────────────────────

export const getMyNotifications = asyncHandler(
    async (req: Request, res: Response) => {
        const userId = req.user!.id;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = parseInt(req.query.offset as string) || 0;

        const items = await db
            .select()
            .from(notifications)
            .where(eq(notifications.recipientId, userId))
            .orderBy(desc(notifications.createdAt))
            .limit(limit)
            .offset(offset);

        const countResult = await db
            .select({ count: sql<number>`cast(count(*) as integer)` })
            .from(notifications)
            .where(eq(notifications.recipientId, userId));
        const total = countResult[0]?.count ?? 0;

        res.json({
            success: true,
            data: {
                notifications: items,
                total,
                limit,
                offset,
                hasMore: offset + items.length < total,
            },
        });
    }
);

// ─── Mark as Read ───────────────────────────────────────────────────────────

export const markAsRead = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const id = req.params["id"]!;

    const updated = await db
        .update(notifications)
        .set({ isRead: true })
        .where(
            and(eq(notifications.id, id), eq(notifications.recipientId, userId))
        )
        .returning();

    if (updated.length === 0) {
        return res
            .status(404)
            .json({ success: false, error: "Notification not found" });
    }

    res.json({ success: true, data: updated[0] });
});

// ─── Mark All as Read ───────────────────────────────────────────────────────

export const markAllAsRead = asyncHandler(
    async (req: Request, res: Response) => {
        const userId = req.user!.id;

        await db
            .update(notifications)
            .set({ isRead: true })
            .where(
                and(
                    eq(notifications.recipientId, userId),
                    eq(notifications.isRead, false)
                )
            );

        res.json({ success: true, message: "All notifications marked as read" });
    }
);

// ─── Get Unread Count ───────────────────────────────────────────────────────

export const getUnreadCount = asyncHandler(
    async (req: Request, res: Response) => {
        const userId = req.user!.id;

        const countResult = await db
            .select({ count: sql<number>`cast(count(*) as integer)` })
            .from(notifications)
            .where(
                and(
                    eq(notifications.recipientId, userId),
                    eq(notifications.isRead, false)
                )
            );
        const unreadCount = countResult[0]?.count ?? 0;

        res.json({ success: true, data: { unreadCount } });
    }
);
