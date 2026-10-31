import express from 'express';
import { authenticate } from '../middlewares/authMiddleware.js';
import {
  getSummaryContext,
  getCategoryContext,
  getTrendsContext,
  getBudgetContext,
  getSearchContext,
  getChartContext,
  queryFinancialContext,
  handleCopilotQuery
} from '../controllers/copilotController.js';

const router = express.Router();

// Require authenticated JWT session for all copilot financial context routes
router.use(authenticate);

// GET /copilot/context/summary - Financial summary (income, expenses, net cash flow)
router.get('/context/summary', getSummaryContext);

// GET /copilot/context/category-breakdown - Category breakdown and top expense category
router.get('/context/category-breakdown', getCategoryContext);

// GET /copilot/context/monthly-trends - Monthly trajectory and historical averages
router.get('/context/monthly-trends', getTrendsContext);

// GET /copilot/context/budget-status - Category budget limits, actual spending, and overspending
router.get('/context/budget-status', getBudgetContext);

// GET /copilot/context/search-transactions - Controlled transaction search (e.g. largest expenses)
router.get('/context/search-transactions', getSearchContext);

// GET /copilot/context/chart-data - Authoritative chart data and semantic highlights
router.get('/context/chart-data', getChartContext);

// POST /copilot/query - Primary AI Copilot query endpoint executing the Day 14 AI flow
router.post('/query', handleCopilotQuery);

// POST /copilot/context/query - Unified intent and question resolver
router.post('/context/query', queryFinancialContext);

export default router;
