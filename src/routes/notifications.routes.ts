import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import {
    getMyNotifications,
    markAsRead,
    markAllAsRead,
    getUnreadCount,
} from "../controllers/notifications.controller.js";

const router = Router();

router.get("/", authMiddleware, getMyNotifications);
router.patch("/:id/read", authMiddleware, markAsRead);
router.patch("/read-all", authMiddleware, markAllAsRead);
router.get("/unread-count", authMiddleware, getUnreadCount);

export default router;
