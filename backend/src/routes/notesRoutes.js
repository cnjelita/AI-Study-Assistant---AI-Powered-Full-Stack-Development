import { Router } from 'express';
import { createNote, listNotes } from '../controllers/notesController.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireAdmin);
router.get('/', listNotes);
router.post('/', createNote);
export default router;
