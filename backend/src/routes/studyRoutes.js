import { Router } from 'express';
import { ask, quiz } from '../controllers/studyController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);
router.post('/ask', ask);
router.post('/quiz', quiz);
export default router;
