import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import {
    registerUser,
    loginUser,
    refreshAccessToken,
    getProfile,
    logoutUser,
} from "../controllers/auth.controller.js";
import { validate } from "../middleware/validate.js";

const router = Router();

router.post(
    "/register",
    validate([
        { field: "name", required: true, type: "string" },
        { field: "email", required: true, type: "email" },
        { field: "password", required: true, type: "string" },
    ]),
    registerUser
);

router.post(
    "/login",
    validate([
        { field: "email", required: true, type: "email" },
        { field: "password", required: true, type: "string" },
    ]),
    loginUser
);

router.post("/refresh", refreshAccessToken);
router.get("/profile", authMiddleware, getProfile);
router.post("/logout", authMiddleware, logoutUser);

export default router;
