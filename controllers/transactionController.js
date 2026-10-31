import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import { toMinorUnits } from '../utils/currency.js';

// POST /transactions - Create a new transaction for the authenticated user
export const createTransaction = async (req, res, next) => {
  try {
    const { type, amount, category, notes, transactionDate, currencyCode } = req.body;

    // Fetch user to inherit base currency if not explicitly passed
    let userCurrency = currencyCode;
    if (!userCurrency) {
      const user = await User.findById(req.user.id);
      userCurrency = user?.currencyCode || 'INR';
    }

    // Convert major unit to integer minor units (e.g. 125.50 -> 12550)
    const amountMinor = toMinorUnits(amount);

    // Create the transaction scoped to authenticated userId
    const transaction = await Transaction.create({
      userId: req.user.id,
      type,
      amountMinor,
      category,
      notes,
      transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
      currencyCode: userCurrency
    });

    // Return the created transaction with formatted JSON
    return res.status(201).json({
      message: 'Transaction created successfully',
      transaction: transaction.toJSON()
    });
  } catch (err) {
    next(err);
  }
};

// GET /transactions - List and filter transactions for the authenticated user
export const getTransactions = async (req, res, next) => {
  try {
    const { from, to, type, category, page, limit, sort } = req.query;

    // Enforce authenticated user scope on all queries
    const filter = { userId: req.user.id };

    // Apply date range filters if provided
    if (from || to) {
      filter.transactionDate = {};
      // Set start of date range
      if (from) {
        filter.transactionDate.$gte = new Date(from);
      }
      // Set end of date range covering the full day if YYYY-MM-DD
      if (to) {
        const toDate = new Date(to);
        if (to.length === 10) {
          toDate.setUTCHours(23, 59, 59, 999);
        }
        filter.transactionDate.$lte = toDate;
      }
    }

    // Filter by transaction type (income or expense)
    if (type) {
      filter.type = type;
    }

    // Filter by specific category
    if (category) {
      filter.category = category;
    }

    // Map sort parameter to database sorting criteria
    const sortMap = {
      date_desc: { transactionDate: -1, _id: -1 },
      date_asc: { transactionDate: 1, _id: 1 },
      amount_desc: { amountMinor: -1, _id: -1 },
      amount_asc: { amountMinor: 1, _id: 1 }
    };
    const sortCriteria = sortMap[sort] || { transactionDate: -1, _id: -1 };

    // Calculate pagination skip offset
    const skip = (page - 1) * limit;

    // Fetch total matching records and current page records
    const [total, transactions] = await Promise.all([
      Transaction.countDocuments(filter),
      Transaction.find(filter).sort(sortCriteria).skip(skip).limit(limit)
    ]);

    // Calculate total pages
    const totalPages = Math.ceil(total / limit) || 1;

    // Return paginated response
    return res.status(200).json({
      transactions: transactions.map((t) => t.toJSON()),
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (err) {
    next(err);
  }
};

// DELETE /transactions/:id - Delete a transaction strictly owned by the user
export const deleteTransaction = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate MongoDB ObjectId structure
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid transaction ID format' });
    }

    // Enforce userId ownership check during deletion
    const transaction = await Transaction.findOneAndDelete({
      _id: id,
      userId: req.user.id
    });

    // Return 404 if transaction does not exist or belongs to another user
    if (!transaction) {
      return res.status(404).json({
        message: 'Transaction not found or you are not authorized to delete it'
      });
    }

    // Return success response
    return res.status(200).json({
      message: 'Transaction deleted successfully',
      id: transaction._id
    });
  } catch (err) {
    next(err);
  }
};
