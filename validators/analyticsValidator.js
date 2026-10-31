import { z } from 'zod';
import { TRANSACTION_TYPES } from '../constants/categories.js';

// Schema for validating analytics query parameters (from, to, type, months)
export const queryAnalyticsSchema = z
  .object({
    // Optional start date filter
    from: z
      .string()
      .optional()
      .refine((val) => !val || !isNaN(Date.parse(val)), {
        message: 'Invalid "from" date format'
      })
      .transform((val) => (val ? val : undefined)),
    // Optional end date filter
    to: z
      .string()
      .optional()
      .refine((val) => !val || !isNaN(Date.parse(val)), {
        message: 'Invalid "to" date format'
      })
      .transform((val) => (val ? val : undefined)),
    // Optional transaction type filter (defaults to expense for category breakdown)
    type: z
      .enum(TRANSACTION_TYPES)
      .or(z.literal(''))
      .optional()
      .transform((val) => (val ? val : undefined)),
    // Optional number of months for trend aggregation (default 6, min 1, max 24)
    months: z
      .union([z.string(), z.number()])
      .optional()
      .default(6)
      .transform((val) => Math.min(24, Math.max(1, parseInt(String(val), 10) || 6)))
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
