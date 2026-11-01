import { z } from 'zod';
import { ALL_CATEGORIES } from '../constants/categories.js';

// Reusable date string regex validator (YYYY-MM-DD)
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const monthRegex = /^\d{4}-\d{2}$/;

// Schema for getFinancialSummary inputs
export const financialSummarySchema = z.object({
  from: z.string().regex(dateRegex, 'from must be YYYY-MM-DD').optional().or(z.literal('')),
  to: z.string().regex(dateRegex, 'to must be YYYY-MM-DD').optional().or(z.literal('')),
  compareWithPreviousMonth: z.union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((val) => val === true || val === 'true')
}).refine((data) => {
  if (data.from && data.to) {
    return new Date(data.from) <= new Date(data.to);
  }
  return true;
}, {
  message: 'from date cannot be later than to date',
  path: ['from']
});

// Schema for getCategoryBreakdown inputs
export const categoryBreakdownSchema = z.object({
  from: z.string().regex(dateRegex, 'from must be YYYY-MM-DD').optional().or(z.literal('')),
  to: z.string().regex(dateRegex, 'to must be YYYY-MM-DD').optional().or(z.literal('')),
  type: z.enum(['income', 'expense']).optional().default('expense')
}).refine((data) => {
  if (data.from && data.to) {
    return new Date(data.from) <= new Date(data.to);
  }
  return true;
}, {
  message: 'from date cannot be later than to date',
  path: ['from']
});

// Schema for getMonthlyTrends inputs
export const monthlyTrendsSchema = z.object({
  months: z.union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (val === undefined || val === '') return 6;
      const parsed = typeof val === 'string' ? parseInt(val, 10) : Number(val);
      return isNaN(parsed) ? 6 : parsed;
    })
    .pipe(z.number().int().min(1, 'Months must be at least 1').max(24, 'Months cannot exceed 24')),
  from: z.string().regex(dateRegex, 'from must be YYYY-MM-DD').optional().or(z.literal('')),
  to: z.string().regex(dateRegex, 'to must be YYYY-MM-DD').optional().or(z.literal(''))
});

// Schema for getBudgetStatus inputs
export const budgetStatusSchema = z.object({
  month: z.string().regex(monthRegex, 'Month must be in YYYY-MM format').optional().or(z.literal(''))
});

// Schema for searchTransactions inputs
export const searchTransactionsSchema = z.object({
  from: z.string().regex(dateRegex, 'from must be YYYY-MM-DD').optional().or(z.literal('')),
  to: z.string().regex(dateRegex, 'to must be YYYY-MM-DD').optional().or(z.literal('')),
  category: z.enum(ALL_CATEGORIES).optional().or(z.literal('')),
  type: z.enum(['income', 'expense']).optional().or(z.literal('')),
  sort: z.enum(['amount_desc', 'amount_asc', 'date_desc', 'date_asc']).optional().default('amount_desc'),
  limit: z.union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (val === undefined || val === '') return 10;
      const parsed = typeof val === 'string' ? parseInt(val, 10) : Number(val);
      return isNaN(parsed) ? 10 : parsed;
    })
    .pipe(z.number().int().min(1).max(50, 'Limit cannot exceed 50'))
});

// Schema for getChartData inputs
export const chartDataSchema = z.object({
  chartType: z.enum(['monthly_comparison', 'category_breakdown', 'net_cash_flow_trend']),
  filters: z.object({
    from: z.string().regex(dateRegex).optional().or(z.literal('')),
    to: z.string().regex(dateRegex).optional().or(z.literal('')),
    months: z.number().int().min(1).max(24).optional()
  }).optional().default({})
});

// General Copilot context query schema
export const copilotQuerySchema = z.object({
  question: z.string().trim().min(1, 'Question cannot be empty'),
  action: z.enum([
    'financial_summary',
    'category_breakdown',
    'monthly_trends',
    'budget_status',
    'search_transactions',
    'chart_data',
    'all'
  ]).optional(),
  chartType: z.enum(['monthly_comparison', 'category_breakdown', 'net_cash_flow_trend']).optional(),
  filters: z.record(z.any()).optional().default({}),
  dashboardContext: z.object({
    dateRange: z.object({
      from: z.string().optional().or(z.literal('')),
      to: z.string().optional().or(z.literal('')),
      months: z.number().optional()
    }).optional(),
    selectedChart: z.string().optional(),
    activeFilters: z.record(z.any()).optional()
  }).optional().default({}),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'copilot', 'model']).optional(),
    sender: z.enum(['user', 'copilot', 'assistant']).optional(),
    content: z.string().optional(),
    text: z.string().optional()
  })).optional().default([])
});

