import { Router } from "express";
import multer from "multer";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";
import {
    createReport,
    getMyReports,
    getReportById,
    deleteReport,
} from "../controllers/reports.controller.js";

const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max per file
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith("image/")) {
            cb(null, true);
        } else {
            cb(new Error("Only image files are allowed"));
        }
    },
});

router.post(
    "/",
    authMiddleware,
    requireRole("citizen"),
    upload.array("files", 5),
    createReport
);

router.get("/my-reports", authMiddleware, requireRole("citizen"), getMyReports);

router.get("/:id", authMiddleware, getReportById);

router.delete("/:id", authMiddleware, requireRole("citizen"), deleteReport);

export default router;
