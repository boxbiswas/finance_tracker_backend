import express from 'express';
import {
  getBudgets,
  createBudget,
  updateBudget,
  deleteBudget
} from '../controllers/budgetController.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import { validateRequest, validateQuery } from '../middlewares/validateRequest.js';
import {
  createBudgetSchema,
  updateBudgetSchema,
  queryBudgetSchema
} from '../validators/budgetValidator.js';

const router = express.Router();

// Enforce authentication on all budget endpoints
router.use(authenticate);

// GET /budgets - List budgets for a month with spending and remaining amounts
router.get('/', validateQuery(queryBudgetSchema), getBudgets);

// POST /budgets - Set a monthly limit for an expense category
router.post('/', validateRequest(createBudgetSchema), createBudget);

// PATCH /budgets/:id - Update limit for an existing category budget
router.patch('/:id', validateRequest(updateBudgetSchema), updateBudget);

// DELETE /budgets/:id - Remove a category budget
router.delete('/:id', deleteBudget);

export default router;

