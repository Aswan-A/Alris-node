import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import { getStats, getAuditLogs } from "../controllers/admin.controller.js";

const router = Router();

router.get("/stats", authMiddleware, requireRole("higher"), getStats);
router.get("/audit-logs", authMiddleware, requireRole("higher"), getAuditLogs);

export default router;
