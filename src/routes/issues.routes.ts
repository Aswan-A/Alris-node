import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { getNearbyIssues, getDepartmentIssues } from '../controllers/issues.controller.js';

const router : Router= Router();

router.get('/nearby', authMiddleware, requireRole('authority'), getNearbyIssues);
router.get('/department', authMiddleware, requireRole('higher'), getDepartmentIssues);

export default router;
