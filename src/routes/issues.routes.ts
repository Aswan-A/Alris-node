import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import {
  getNearbyIssues,
  getDepartmentIssues,
  getIssueById,
  updateIssueStatus,
  upvoteIssue,
  removeUpvote,
} from "../controllers/issues.controller.js";

const router = Router();

router.get(
  "/nearby",
  authMiddleware,
  requireRole("citizen", "authority"),
  getNearbyIssues
);

router.get(
  "/department",
  authMiddleware,
  requireRole("higher"),
  getDepartmentIssues
);

router.get(
  "/:issueId",
  authMiddleware,
  requireRole("citizen", "authority", "higher"),
  getIssueById
);

router.put(
  "/status",
  authMiddleware,
  requireRole("higher", "authority"),
  updateIssueStatus
);

router.post(
  "/:issueId/upvote",
  authMiddleware,
  requireRole("citizen"),
  upvoteIssue
);

router.delete(
  "/:issueId/upvote",
  authMiddleware,
  requireRole("citizen"),
  removeUpvote
);

export default router;