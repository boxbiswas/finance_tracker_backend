import express from 'express';
import {
  createTransaction,
  getTransactions,
  deleteTransaction
} from '../controllers/transactionController.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import { validateRequest, validateQuery } from '../middlewares/validateRequest.js';
import {
  createTransactionSchema,
  queryTransactionSchema
} from '../validators/transactionValidator.js';

const router = express.Router();

// Enforce authentication on all transaction endpoints
router.use(authenticate);

// POST /transactions - Create a new transaction with request validation
router.post('/', validateRequest(createTransactionSchema), createTransaction);

// GET /transactions - List and filter transactions with query validation
router.get('/', validateQuery(queryTransactionSchema), getTransactions);

// DELETE /transactions/:id - Delete a transaction by ID with user ownership check
router.delete('/:id', deleteTransaction);

export default router;
