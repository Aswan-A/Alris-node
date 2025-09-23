import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.js';
import { createReport, getMyReports } from '../controllers/reports.controller.js';

const router : Router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/', authMiddleware, upload.array('files', 5), createReport);
router.get('/my-reports', authMiddleware, getMyReports);

export default router;
