import { z } from 'zod';
import { isValidCategory, TRANSACTION_TYPES, ALL_CATEGORIES } from '../constants/categories.js';

// Schema for validating new transaction creation requests
export const createTransactionSchema = z
  .object({
    // Transaction type must be income or expense
    type: z.enum(TRANSACTION_TYPES, {
      required_error: 'Type is required (income or expense)'
    }),
    // Accepts number or string, ensures positive value
    amount: z
      .union([z.number(), z.string()], {
        required_error: 'Amount is required'
      })
      .refine(
        (val) => {
          const num = Number(val);
          return !isNaN(num) && num > 0 && isFinite(num);
        },
        { message: 'Amount must be a positive number' }
      )
      .transform((val) => Number(val)),
    // Category must be a non-empty string
    category: z
      .string({ required_error: 'Category is required' })
      .trim()
      .min(1, 'Category is required'),
    // Optional transaction notes with 500 max character length
    notes: z
      .string()
      .trim()
      .max(500, 'Notes cannot exceed 500 characters')
      .optional()
      .default(''),
    // Optional ISO or YYYY-MM-DD date string
    transactionDate: z
      .string()
      .optional()
      .refine((val) => !val || !isNaN(Date.parse(val)), {
        message: 'Invalid transaction date format'
      }),
    // Optional 3-character ISO currency code
    currencyCode: z
      .string()
      .trim()
      .length(3, 'Currency code must be exactly 3 letters')
      .toUpperCase()
      .optional()
  })
  // Ensure selected category is compatible with income or expense type
  .refine((data) => isValidCategory(data.type, data.category), {
    message: 'Selected category is not compatible with the transaction type',
    path: ['category']
  });

// Schema for validating transaction query parameters and filters
export const queryTransactionSchema = z
  .object({
    // Start date filter (treat empty string as undefined)
    from: z
      .string()
      .optional()
      .refine((val) => !val || !isNaN(Date.parse(val)), {
        message: 'Invalid "from" date format'
      })
      .transform((val) => (val ? val : undefined)),
    // End date filter (treat empty string as undefined)
    to: z
      .string()
      .optional()
      .refine((val) => !val || !isNaN(Date.parse(val)), {
        message: 'Invalid "to" date format'
      })
      .transform((val) => (val ? val : undefined)),
    // Optional type filter (accept empty string and convert to undefined)
    type: z
      .enum(TRANSACTION_TYPES)
      .or(z.literal(''))
      .optional()
      .transform((val) => (val ? val : undefined)),
    // Optional category filter (accept empty string and convert to undefined)
    category: z
      .string()
      .trim()
      .optional()
      .transform((val) => (val ? val : undefined)),
    // Page number accepts string or number, defaults to 1
    page: z
      .union([z.string(), z.number()])
      .optional()
      .default(1)
      .transform((val) => Math.max(1, parseInt(String(val), 10) || 1)),
    // Items per page accepts string or number, capped at 100, defaults to 10
    limit: z
      .union([z.string(), z.number()])
      .optional()
      .default(10)
      .transform((val) => Math.min(100, Math.max(1, parseInt(String(val), 10) || 10))),
    // Sort option defaults to newest date first
    sort: z
      .enum(['date_desc', 'date_asc', 'amount_desc', 'amount_asc'])
      .optional()
      .default('date_desc')
  })
  // Verify date range order when both from and to are supplied
  .refine(
    (data) => {
      if (data.from && data.to) {
        return new Date(data.from) <= new Date(data.to);
      }
      return true;
    },
    {
      message: '"from" date cannot be after "to" date',
      path: ['from']
    }
  );
