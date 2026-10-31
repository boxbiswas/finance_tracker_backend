import express from 'express';
import { exportTransactions } from '../controllers/exportController.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import { validateQuery } from '../middlewares/validateRequest.js';
import { exportQuerySchema } from '../validators/exportValidator.js';

const router = express.Router();

// Enforce authentication on all export endpoints
router.use(authenticate);

// GET /exports/transactions?format=csv|pdf - Export user's filtered transactions
router.get('/transactions', validateQuery(exportQuerySchema), exportTransactions);

export default router;

