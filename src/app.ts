import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import reportsRoutes from "./routes/reports.routes.js";
import issuesRoutes from "./routes/issues.routes.js";
import authorityRoutes from "./routes/authority.routes.js";
import ratingsRoutes from "./routes/ratings.routes.js";
import notificationsRoutes from "./routes/notifications.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import { globalErrorHandler } from "./middleware/error-handler.js";

const app = express();

// ─── Global Middleware ──────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ─── Routes ─────────────────────────────────────────────────────────────────
app.use("/auth", authRoutes);
app.use("/reports", reportsRoutes);
app.use("/issues", issuesRoutes);
app.use("/authority", authorityRoutes);
app.use("/ratings", ratingsRoutes);
app.use("/notifications", notificationsRoutes);
app.use("/admin", adminRoutes);

// ─── Health & Root ──────────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "Alris Issue Reporting System API",
    version: "2.0.0",
    endpoints: {
      auth: "/auth",
      reports: "/reports",
      issues: "/issues",
      authority: "/authority",
      ratings: "/ratings",
      notifications: "/notifications",
      admin: "/admin",
    },
  });
});

app.get("/health", (_req, res) => {
  res.json({ success: true, status: "healthy", timestamp: new Date().toISOString() });
});

// ─── Global Error Handler ───────────────────────────────────────────────────
app.use(globalErrorHandler);

export default app;
