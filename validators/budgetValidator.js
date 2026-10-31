import { z } from 'zod';
import { EXPENSE_CATEGORIES } from '../constants/categories.js';

// Schema for validating new budget creation requests
export const createBudgetSchema = z.object({
  // Category must be a valid expense category
  category: z.enum(EXPENSE_CATEGORIES, {
    required_error: 'Expense category is required',
    invalid_type_error: 'Must be a valid expense category'
  }),
  // Budget limit must be a positive number
  limit: z
    .union([z.number(), z.string()], {
      required_error: 'Budget limit is required'
    })
    .refine(
      (val) => {
        const num = Number(val);
        return !isNaN(num) && num > 0 && isFinite(num);
      },
      { message: 'Budget limit must be a positive number' }
    )
    .transform((val) => Number(val)),
  // Optional month string (e.g. '2026-10' or ISO date)
  month: z
    .string()
    .optional()
    .refine((val) => !val || !isNaN(Date.parse(val.length === 7 ? `${val}-01` : val)), {
      message: 'Invalid month format (expected YYYY-MM or date)'
    }),
  // Optional 3-character ISO currency code
  currencyCode: z
    .string()
    .trim()
    .length(3, 'Currency code must be exactly 3 letters')
    .toUpperCase()
    .optional()
});

// Schema for validating budget limit updates (PATCH /budgets/:id)
export const updateBudgetSchema = z.object({
  // Limit to update
  limit: z
    .union([z.number(), z.string()], {
      required_error: 'Budget limit is required'
    })
    .refine(
      (val) => {
        const num = Number(val);
        return !isNaN(num) && num > 0 && isFinite(num);
      },
      { message: 'Budget limit must be a positive number' }
    )
    .transform((val) => Number(val))
});

// Schema for validating budget query parameters (GET /budgets?month=YYYY-MM)
export const queryBudgetSchema = z.object({
  // Optional month filter
  month: z
    .string()
    .optional()
    .refine((val) => !val || !isNaN(Date.parse(val.length === 7 ? `${val}-01` : val)), {
      message: 'Invalid month format (expected YYYY-MM or date)'
    })
    .transform((val) => (val ? val : undefined))
});

