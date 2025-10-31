import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import {
  getNearbyIssues,
  getDepartmentIssues,
  updateIssueStatus,
} from "../controllers/issues.controller.js";

const router = Router();

router.get(
  "/nearby",
  authMiddleware,
  requireRole("authority"),
  getNearbyIssues
);
router.get(
  "/department",
  authMiddleware,
  requireRole("higher"),
  getDepartmentIssues
);
router.put("/status", authMiddleware,requireRole("higher", "authority"), updateIssueStatus);

export default router;
