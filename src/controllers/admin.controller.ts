import type { Request, Response } from "express";
import { sql, desc, eq } from "drizzle-orm";
import { db } from "../config/db.js";
import {
    users,
    reports,
    issues,
    reportUploads,
    auditLogs,
} from "../database/schema.js";
import { asyncHandler } from "../middleware/error-handler.js";

// ─── Dashboard Stats ────────────────────────────────────────────────────────

export const getStats = asyncHandler(async (_req: Request, res: Response) => {
    const userCountResult = await db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(users);
    const reportCountResult = await db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(reports);
    const issueCountResult = await db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(issues);
    const classifiedResult = await db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(reports)
        .where(eq(reports.isClassified, true));
    const flaggedResult = await db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(users)
        .where(eq(users.isFlagged, true));
    const fakeResult = await db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(reportUploads)
        .where(eq(reportUploads.isFake, true));
    const spamResult = await db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(reportUploads)
        .where(eq(reportUploads.isSpam, true));

    // Issues by status
    const statusBreakdown = await db
        .select({
            status: issues.status,
            count: sql<number>`cast(count(*) as integer)`,
        })
        .from(issues)
        .groupBy(issues.status);

    const totalReports = reportCountResult[0]?.count ?? 0;
    const classifiedReports = classifiedResult[0]?.count ?? 0;

    res.json({
        success: true,
        data: {
            totalUsers: userCountResult[0]?.count ?? 0,
            totalReports,
            totalIssues: issueCountResult[0]?.count ?? 0,
            classifiedReports,
            unclassifiedReports: totalReports - classifiedReports,
            flaggedUsers: flaggedResult[0]?.count ?? 0,
            fakeUploads: fakeResult[0]?.count ?? 0,
            spamUploads: spamResult[0]?.count ?? 0,
            issuesByStatus: statusBreakdown.reduce(
                (acc, row) => {
                    acc[row.status] = row.count;
                    return acc;
                },
                {} as Record<string, number>
            ),
        },
    });
});

// ─── Audit Logs ─────────────────────────────────────────────────────────────

export const getAuditLogs = asyncHandler(
    async (req: Request, res: Response) => {
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;
        const action = req.query.action as string | undefined;

        let logs;
        if (action) {
            logs = await db
                .select()
                .from(auditLogs)
                .where(eq(auditLogs.action, action as any))
                .orderBy(desc(auditLogs.createdAt))
                .limit(limit)
                .offset(offset);
        } else {
            logs = await db
                .select()
                .from(auditLogs)
                .orderBy(desc(auditLogs.createdAt))
                .limit(limit)
                .offset(offset);
        }

        const countResult = await db
            .select({ count: sql<number>`cast(count(*) as integer)` })
            .from(auditLogs);
        const total = countResult[0]?.count ?? 0;

        res.json({
            success: true,
            data: {
                logs,
                total,
                limit,
                offset,
                hasMore: offset + logs.length < total,
            },
        });
    }
);
