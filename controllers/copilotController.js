import {
  getFinancialSummary,
  getCategoryBreakdown,
  getMonthlyTrends,
  getBudgetStatus,
  searchTransactions,
  getChartData,
  resolveFinancialQuestion
} from '../services/financialContextService.js';
import { processCopilotQuery } from '../services/copilotService.js';

// GET /copilot/context/summary - Return verified income, expense, and net cash flow summary
export const getSummaryContext = async (req, res, next) => {
  try {
    const data = await getFinancialSummary(req.user.id, req.query);
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};

// GET /copilot/context/category-breakdown - Return verified category expense breakdown and top category
export const getCategoryContext = async (req, res, next) => {
  try {
    const data = await getCategoryBreakdown(req.user.id, req.query);
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};

// GET /copilot/context/monthly-trends - Return verified monthly trends and averages
export const getTrendsContext = async (req, res, next) => {
  try {
    const data = await getMonthlyTrends(req.user.id, req.query);
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};

// GET /copilot/context/budget-status - Return verified budget limits, actual spending, and overspending alerts
export const getBudgetContext = async (req, res, next) => {
  try {
    const data = await getBudgetStatus(req.user.id, req.query);
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};

// GET /copilot/context/search-transactions - Return controlled lean transaction records (e.g. largest expenses)
export const getSearchContext = async (req, res, next) => {
  try {
    const data = await searchTransactions(req.user.id, req.query);
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};

// GET /copilot/context/chart-data - Return authoritative chart data and insights from database
export const getChartContext = async (req, res, next) => {
  try {
    const data = await getChartData(req.user.id, {
      chartType: req.query.chartType,
      filters: req.query
    });
    res.status(200).json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};

// POST /copilot/query - Primary AI Copilot query endpoint executing the full Day 14 and Day 15 flow
export const handleCopilotQuery = async (req, res, next) => {
  try {
    const { question, action, chartType, filters, dashboardContext, messages } = req.body || {};
    const result = await processCopilotQuery(
      req.user.id,
      { question, action, chartType, filters, dashboardContext, messages },
      req.user
    );
    res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
};

// POST /copilot/context/query - Resolve financial questions or intents with authoritative verified data
export const queryFinancialContext = async (req, res, next) => {
  try {
    const { question, action, chartType, filters } = req.body || {};
    const result = await resolveFinancialQuestion(req.user.id, {
      question,
      action,
      chartType,
      filters
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
};

