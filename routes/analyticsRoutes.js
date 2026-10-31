import express from 'express';
import {
  getSummary,
  getCategoryBreakdown,
  getMonthlyTrends
} from '../controllers/analyticsController.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import { validateQuery } from '../middlewares/validateRequest.js';
import { queryAnalyticsSchema } from '../validators/analyticsValidator.js';

const router = express.Router();

// Enforce authentication on all analytics routes
router.use(authenticate);

// GET /analytics/summary - High level summary totals
router.get('/summary', validateQuery(queryAnalyticsSchema), getSummary);

// GET /analytics/category-breakdown - Category spend or income distribution
router.get('/category-breakdown', validateQuery(queryAnalyticsSchema), getCategoryBreakdown);

// GET /analytics/monthly-trends - Monthly income, expense, and net cash flow trends
router.get('/monthly-trends', validateQuery(queryAnalyticsSchema), getMonthlyTrends);

export default router;
