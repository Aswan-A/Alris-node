import { Router } from "express";
import {
  registerLowerAuthority,
  loginAuthority,
  updateAuthorityProfile,
  getAuthorityProfile,
} from "../controllers/authority.controller.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = Router();

router.post(
  "/register-lower",
  authMiddleware,
  requireRole("higher"),
  registerLowerAuthority
);

router.post("/login", loginAuthority);

router.put(
  "/update-profile",
  authMiddleware,
  requireRole("authority"),
  updateAuthorityProfile
);

router.get(
  "/profile",
  authMiddleware,
  requireRole("authority", "higher"),
  getAuthorityProfile
);

export default router;
