import { Router } from 'express';
import {
  registerLowerAuthority,
  loginAuthority,
  updateAuthorityProfile
} from '../controllers/authority.controller.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';

const router = Router();

router.post('/register-lower', authMiddleware, requireRole('higher'), registerLowerAuthority);

// Login for both higher & lower authorities
router.post('/login', loginAuthority);

// Lower authority updates profile and password
router.put('/update-profile', authMiddleware, requireRole('authority'), updateAuthorityProfile);

export default router;
