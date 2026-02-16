import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type {
    users,
    authorities,
    higherAuthorities,
    departments,
    issues,
    reports,
    reportUploads,
    userRatings,
    issueUpvotes,
    notifications,
    auditLogs,
    refreshTokens,
} from "../database/schema.js";

// ─── Database Model Types ───────────────────────────────────────────────────

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

export type Authority = InferSelectModel<typeof authorities>;
export type NewAuthority = InferInsertModel<typeof authorities>;

export type HigherAuthority = InferSelectModel<typeof higherAuthorities>;
export type NewHigherAuthority = InferInsertModel<typeof higherAuthorities>;

export type Department = InferSelectModel<typeof departments>;
export type NewDepartment = InferInsertModel<typeof departments>;

export type Issue = InferSelectModel<typeof issues>;
export type NewIssue = InferInsertModel<typeof issues>;

export type Report = InferSelectModel<typeof reports>;
export type NewReport = InferInsertModel<typeof reports>;

export type ReportUpload = InferSelectModel<typeof reportUploads>;
export type NewReportUpload = InferInsertModel<typeof reportUploads>;

export type UserRating = InferSelectModel<typeof userRatings>;
export type NewUserRating = InferInsertModel<typeof userRatings>;

export type IssueUpvote = InferSelectModel<typeof issueUpvotes>;
export type NewIssueUpvote = InferInsertModel<typeof issueUpvotes>;

export type Notification = InferSelectModel<typeof notifications>;
export type NewNotification = InferInsertModel<typeof notifications>;

export type AuditLog = InferSelectModel<typeof auditLogs>;
export type NewAuditLog = InferInsertModel<typeof auditLogs>;

export type RefreshToken = InferSelectModel<typeof refreshTokens>;
export type NewRefreshToken = InferInsertModel<typeof refreshTokens>;

// ─── JWT & Auth Types ───────────────────────────────────────────────────────

export interface JwtPayload {
    id: string;
    email?: string;
    role: "citizen" | "authority" | "higher";
    department?: string;
}

// Extend Express Request
declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload;
        }
    }
}

// ─── API Response Types ─────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
}
