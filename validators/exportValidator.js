import { z } from 'zod';
import { TRANSACTION_TYPES } from '../constants/categories.js';

// Schema for validating transaction export queries (format, from, to, type, category, sort)
export const exportQuerySchema = z
  .object({
    // Export format must be either csv or pdf
    format: z.enum(['csv', 'pdf'], {
      required_error: 'Export format is required (csv or pdf)'
    }),
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
    // Optional transaction type filter
    type: z
      .enum(TRANSACTION_TYPES)
      .or(z.literal(''))
      .optional()
      .transform((val) => (val ? val : undefined)),
    // Optional category filter
    category: z
      .string()
      .trim()
      .optional()
      .transform((val) => (val ? val : undefined)),
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

