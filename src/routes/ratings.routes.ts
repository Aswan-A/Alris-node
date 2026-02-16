import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import {
    rateUser,
    getUserRatings,
    getFlaggedUsers,
} from "../controllers/ratings.controller.js";

const router = Router();

// Authority or higher rates a citizen
router.post(
    "/user/:userId",
    authMiddleware,
    requireRole("authority", "higher"),
    rateUser
);

// Get all ratings for a user
router.get(
    "/user/:userId",
    authMiddleware,
    requireRole("authority", "higher"),
    getUserRatings
);

// Get all flagged users
router.get(
    "/flagged",
    authMiddleware,
    requireRole("authority", "higher"),
    getFlaggedUsers
);

export default router;
