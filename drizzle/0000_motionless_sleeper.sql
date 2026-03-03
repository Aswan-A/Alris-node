CREATE TYPE "public"."audit_action" AS ENUM('report_created', 'report_deleted', 'issue_created', 'issue_status_updated', 'issue_upvoted', 'issue_downvoted', 'user_rated', 'user_flagged', 'user_unflagged', 'authority_registered', 'authority_profile_updated');--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('submitted', 'in_progress', 'resolved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('issue_status_changed', 'report_classified', 'user_flagged', 'user_rated', 'new_report_on_issue', 'system');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"actor_role" text NOT NULL,
	"action" "audit_action" NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"metadata" text,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "authorities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"phone" text,
	"latitude" double precision DEFAULT 0,
	"longitude" double precision DEFAULT 0,
	"department" text NOT NULL,
	"is_initialized" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "authorities_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "departments_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "higher_authorities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"phone" text,
	"department" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "higher_authorities_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "issue_upvotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"category" text,
	"department" text,
	"description" text,
	"status" "issue_status" DEFAULT 'submitted' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"upvote_count" integer DEFAULT 0 NOT NULL,
	"report_count" integer DEFAULT 0 NOT NULL,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"recipient_role" text NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"reference_id" uuid,
	"reference_type" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"is_fake" boolean DEFAULT false NOT NULL,
	"is_spam" boolean DEFAULT false NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"issue_id" uuid,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"description" text,
	"is_classified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"rated_by" uuid NOT NULL,
	"rated_by_role" text NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"report_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rating_range" CHECK ("user_ratings"."rating" >= 1 AND "user_ratings"."rating" <= 5)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"password_hash" text NOT NULL,
	"avatar_url" text,
	"trust_score" real DEFAULT 3 NOT NULL,
	"is_flagged" boolean DEFAULT false NOT NULL,
	"total_reports" integer DEFAULT 0 NOT NULL,
	"total_upvotes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "issue_upvotes" ADD CONSTRAINT "issue_upvotes_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_upvotes" ADD CONSTRAINT "issue_upvotes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_uploads" ADD CONSTRAINT "report_uploads_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ratings" ADD CONSTRAINT "user_ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ratings" ADD CONSTRAINT "user_ratings_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "authorities_email_idx" ON "authorities" USING btree ("email");--> statement-breakpoint
CREATE INDEX "authorities_department_idx" ON "authorities" USING btree ("department");--> statement-breakpoint
CREATE INDEX "higher_authorities_email_idx" ON "higher_authorities" USING btree ("email");--> statement-breakpoint
CREATE INDEX "higher_authorities_department_idx" ON "higher_authorities" USING btree ("department");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_upvotes_unique_idx" ON "issue_upvotes" USING btree ("issue_id","user_id");--> statement-breakpoint
CREATE INDEX "issue_upvotes_issue_id_idx" ON "issue_upvotes" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "issues_department_idx" ON "issues" USING btree ("department");--> statement-breakpoint
CREATE INDEX "issues_status_idx" ON "issues" USING btree ("status");--> statement-breakpoint
CREATE INDEX "issues_priority_idx" ON "issues" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "issues_created_at_idx" ON "issues" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "notifications" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "notifications_is_read_idx" ON "notifications" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_token_idx" ON "refresh_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "report_uploads_report_id_idx" ON "report_uploads" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "reports_user_id_idx" ON "reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reports_issue_id_idx" ON "reports" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "reports_is_classified_idx" ON "reports" USING btree ("is_classified");--> statement-breakpoint
CREATE INDEX "reports_created_at_idx" ON "reports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_ratings_user_id_idx" ON "user_ratings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_ratings_rated_by_idx" ON "user_ratings" USING btree ("rated_by");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_trust_score_idx" ON "users" USING btree ("trust_score");--> statement-breakpoint
CREATE INDEX "users_is_flagged_idx" ON "users" USING btree ("is_flagged");