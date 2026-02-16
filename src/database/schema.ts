import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  doublePrecision,
  integer,
  real,
  index,
  uniqueIndex,
  check,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const issueStatusEnum = pgEnum("issue_status", [
  "submitted",
  "in_progress",
  "resolved",
  "rejected",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "issue_status_changed",
  "report_classified",
  "user_flagged",
  "user_rated",
  "new_report_on_issue",
  "system",
]);

export const auditActionEnum = pgEnum("audit_action", [
  "report_created",
  "report_deleted",
  "issue_created",
  "issue_status_updated",
  "issue_upvoted",
  "issue_downvoted",
  "user_rated",
  "user_flagged",
  "user_unflagged",
  "authority_registered",
  "authority_profile_updated",
]);

// ─── Departments ─────────────────────────────────────────────────────────────

export const departments = pgTable("departments", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Users (Citizens) ───────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    phone: text("phone"),
    passwordHash: text("password_hash").notNull(),
    avatarUrl: text("avatar_url"),
    trustScore: real("trust_score").default(3.0).notNull(),
    isFlagged: boolean("is_flagged").default(false).notNull(),
    totalReports: integer("total_reports").default(0).notNull(),
    totalUpvotes: integer("total_upvotes").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("users_email_idx").on(table.email),
    index("users_trust_score_idx").on(table.trustScore),
    index("users_is_flagged_idx").on(table.isFlagged),
  ]
);

// ─── Authorities (Local Officials) ──────────────────────────────────────────

export const authorities = pgTable(
  "authorities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name"),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    phone: text("phone"),
    latitude: doublePrecision("latitude").default(0),
    longitude: doublePrecision("longitude").default(0),
    // PostGIS geometry stored as text — managed via raw SQL triggers
    department: text("department").notNull(),
    isInitialized: boolean("is_initialized").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("authorities_email_idx").on(table.email),
    index("authorities_department_idx").on(table.department),
  ]
);

// ─── Higher Authorities (Department Heads) ──────────────────────────────────

export const higherAuthorities = pgTable(
  "higher_authorities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    phone: text("phone"),
    department: text("department").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("higher_authorities_email_idx").on(table.email),
    index("higher_authorities_department_idx").on(table.department),
  ]
);

// ─── Issues (Canonical, merged from reports) ────────────────────────────────

export const issues = pgTable(
  "issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    // PostGIS geometry — managed via raw SQL
    category: text("category"),
    department: text("department"),
    description: text("description"),
    status: issueStatusEnum("status").default("submitted").notNull(),
    priority: integer("priority").default(0).notNull(),
    upvoteCount: integer("upvote_count").default(0).notNull(),
    reportCount: integer("report_count").default(0).notNull(),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("issues_department_idx").on(table.department),
    index("issues_status_idx").on(table.status),
    index("issues_priority_idx").on(table.priority),
    index("issues_created_at_idx").on(table.createdAt),
  ]
);

// ─── Reports (Raw citizen submissions) ──────────────────────────────────────

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    issueId: uuid("issue_id").references(() => issues.id, {
      onDelete: "set null",
    }),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    // PostGIS geometry — managed via raw SQL
    description: text("description"),
    isClassified: boolean("is_classified").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("reports_user_id_idx").on(table.userId),
    index("reports_issue_id_idx").on(table.issueId),
    index("reports_is_classified_idx").on(table.isClassified),
    index("reports_created_at_idx").on(table.createdAt),
  ]
);

// ─── Report Uploads (Images per report) ─────────────────────────────────────

export const reportUploads = pgTable(
  "report_uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id")
      .references(() => reports.id, { onDelete: "cascade" })
      .notNull(),
    filename: text("filename").notNull(),
    // vector(512) for CLIP embeddings — managed via raw SQL (Drizzle doesn't support pgvector)
    isFake: boolean("is_fake").default(false).notNull(),
    isSpam: boolean("is_spam").default(false).notNull(),
    uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  },
  (table) => [index("report_uploads_report_id_idx").on(table.reportId)]
);

// ─── User Ratings (Authority rates citizen authenticity) ────────────────────

export const userRatings = pgTable(
  "user_ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    ratedBy: uuid("rated_by").notNull(), // authority or higher authority ID
    ratedByRole: text("rated_by_role").notNull(), // 'authority' | 'higher'
    rating: integer("rating").notNull(), // 1–5
    comment: text("comment"),
    reportId: uuid("report_id").references(() => reports.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("user_ratings_user_id_idx").on(table.userId),
    index("user_ratings_rated_by_idx").on(table.ratedBy),
    check("rating_range", sql`${table.rating} >= 1 AND ${table.rating} <= 5`),
  ]
);

// ─── Issue Upvotes ──────────────────────────────────────────────────────────

export const issueUpvotes = pgTable(
  "issue_upvotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issueId: uuid("issue_id")
      .references(() => issues.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("issue_upvotes_unique_idx").on(table.issueId, table.userId),
    index("issue_upvotes_issue_id_idx").on(table.issueId),
  ]
);

// ─── Notifications ──────────────────────────────────────────────────────────

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipientId: uuid("recipient_id").notNull(),
    recipientRole: text("recipient_role").notNull(), // 'citizen' | 'authority' | 'higher'
    type: notificationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    referenceId: uuid("reference_id"), // issue_id, report_id, etc.
    referenceType: text("reference_type"), // 'issue' | 'report' | 'user'
    isRead: boolean("is_read").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("notifications_recipient_idx").on(table.recipientId),
    index("notifications_is_read_idx").on(table.isRead),
    index("notifications_created_at_idx").on(table.createdAt),
  ]
);

// ─── Audit Logs ─────────────────────────────────────────────────────────────

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").notNull(),
    actorRole: text("actor_role").notNull(),
    action: auditActionEnum("action").notNull(),
    entityType: text("entity_type").notNull(), // 'report' | 'issue' | 'user' | 'authority'
    entityId: uuid("entity_id").notNull(),
    metadata: text("metadata"), // JSON string for additional details
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_logs_actor_id_idx").on(table.actorId),
    index("audit_logs_action_idx").on(table.action),
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
    index("audit_logs_created_at_idx").on(table.createdAt),
  ]
);

// ─── Refresh Tokens ─────────────────────────────────────────────────────────

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("refresh_tokens_user_id_idx").on(table.userId),
    index("refresh_tokens_token_idx").on(table.token),
  ]
);

// ─── Relations ──────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  reports: many(reports),
  ratings: many(userRatings),
  upvotes: many(issueUpvotes),
  notifications: many(notifications),
}));

export const issuesRelations = relations(issues, ({ many }) => ({
  reports: many(reports),
  upvotes: many(issueUpvotes),
}));

export const reportsRelations = relations(reports, ({ one, many }) => ({
  user: one(users, { fields: [reports.userId], references: [users.id] }),
  issue: one(issues, { fields: [reports.issueId], references: [issues.id] }),
  uploads: many(reportUploads),
  ratings: many(userRatings),
}));

export const reportUploadsRelations = relations(reportUploads, ({ one }) => ({
  report: one(reports, {
    fields: [reportUploads.reportId],
    references: [reports.id],
  }),
}));

export const userRatingsRelations = relations(userRatings, ({ one }) => ({
  user: one(users, {
    fields: [userRatings.userId],
    references: [users.id],
  }),
  report: one(reports, {
    fields: [userRatings.reportId],
    references: [reports.id],
  }),
}));

export const issueUpvotesRelations = relations(issueUpvotes, ({ one }) => ({
  issue: one(issues, {
    fields: [issueUpvotes.issueId],
    references: [issues.id],
  }),
  user: one(users, {
    fields: [issueUpvotes.userId],
    references: [users.id],
  }),
}));
