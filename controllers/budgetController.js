import mongoose from 'mongoose';
import Budget from '../models/Budget.js';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import { toMinorUnits, normalizeToMonthStartUTC } from '../utils/currency.js';

// Helper to calculate spending metrics and overspending flags for a budget item
const enrichBudget = (budgetDoc, spentMinor = 0) => {
  const limitMinor = budgetDoc.limitMinor;
  const limit = limitMinor / 100;
  const spent = spentMinor / 100;
  const remainingMinor = limitMinor - spentMinor;
  const remaining = remainingMinor / 100;
  const percentage = limit > 0 ? Number(((spent / limit) * 100).toFixed(1)) : 0;
  const isOverBudget = spentMinor > limitMinor;
  const overBy = isOverBudget ? Number(((spentMinor - limitMinor) / 100).toFixed(2)) : 0;
  const isNearLimit = percentage >= 75 && percentage < 100;

  return {
    id: budgetDoc._id.toString(),
    userId: budgetDoc.userId.toString(),
    category: budgetDoc.category,
    monthStart: budgetDoc.monthStart,
    limitMinor,
    limit,
    spentMinor,
    spent,
    remainingMinor,
    remaining,
    percentage,
    isOverBudget,
    overBy,
    isNearLimit,
    currencyCode: budgetDoc.currencyCode || 'INR',
    createdAt: budgetDoc.createdAt,
    updatedAt: budgetDoc.updatedAt
  };
};

// GET /budgets - List all category budgets for the specified or current month with actual spending
export const getBudgets = async (req, res, next) => {
  try {
    const { month } = req.query;

    // Normalize date to UTC 1st day of month
    const targetDate = month ? (month.length === 7 ? `${month}-01` : month) : new Date();
    const monthStart = normalizeToMonthStartUTC(targetDate);
    const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    // Fetch user's budgets for the target month
    const budgets = await Budget.find({
      userId: req.user.id,
      monthStart
    }).sort({ createdAt: -1 });

    // Aggregate user's expense transactions for the same month period
    const spendingData = await Transaction.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(req.user.id),
          type: 'expense',
          transactionDate: { $gte: monthStart, $lte: monthEnd }
        }
      },
      {
        $group: {
          _id: '$category',
          spentMinor: { $sum: '$amountMinor' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Build fast lookup map for category spending
    const spendingMap = {};
    spendingData.forEach((item) => {
      spendingMap[item._id] = item.spentMinor;
    });

    // Enrich each budget with spending progress, percentage, and overspending indicators
    const enrichedBudgets = budgets.map((b) => enrichBudget(b, spendingMap[b.category] || 0));

    // Calculate month-level summary metrics across all configured budgets
    let totalBudgetedMinor = 0;
    let totalSpentMinor = 0;
    let overBudgetCount = 0;

    enrichedBudgets.forEach((b) => {
      totalBudgetedMinor += b.limitMinor;
      totalSpentMinor += b.spentMinor;
      if (b.isOverBudget) {
        overBudgetCount += 1;
      }
    });

    const totalBudgeted = totalBudgetedMinor / 100;
    const totalSpent = totalSpentMinor / 100;
    const totalRemaining = (totalBudgetedMinor - totalSpentMinor) / 100;
    const overallPercentage = totalBudgeted > 0 ? Number(((totalSpent / totalBudgeted) * 100).toFixed(1)) : 0;

    // Format ISO month string for response (e.g. '2026-10')
    const monthString = `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}`;

    return res.status(200).json({
      month: monthString,
      monthStart,
      monthEnd,
      summary: {
        totalBudgeted,
        totalSpent,
        totalRemaining,
        overallPercentage,
        totalBudgets: enrichedBudgets.length,
        overBudgetCount
      },
      budgets: enrichedBudgets
    });
  } catch (err) {
    next(err);
  }
};

// POST /budgets - Create a new category budget for a month
export const createBudget = async (req, res, next) => {
  try {
    const { category, limit, month, currencyCode } = req.body;

    // Normalize target month to UTC start
    const targetDate = month ? (month.length === 7 ? `${month}-01` : month) : new Date();
    const monthStart = normalizeToMonthStartUTC(targetDate);
    const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    // Inherit user default currency if omitted
    let userCurrency = currencyCode;
    if (!userCurrency) {
      const user = await User.findById(req.user.id);
      userCurrency = user?.currencyCode || 'INR';
    }

    // Convert decimal major currency amount to integer minor units
    const limitMinor = toMinorUnits(limit);

    // Prevent duplicate budget for the same user, category, and month
    const existing = await Budget.findOne({
      userId: req.user.id,
      category,
      monthStart
    });

    if (existing) {
      return res.status(409).json({
        message: 'A budget for this category and month already exists. You can edit the existing budget instead.'
      });
    }

    // Persist new budget record
    const budget = await Budget.create({
      userId: req.user.id,
      category,
      monthStart,
      limitMinor,
      currencyCode: userCurrency
    });

    // Query existing spending for this category in the month
    const spendingAgg = await Transaction.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(req.user.id),
          type: 'expense',
          category,
          transactionDate: { $gte: monthStart, $lte: monthEnd }
        }
      },
      {
        $group: {
          _id: null,
          spentMinor: { $sum: '$amountMinor' }
        }
      }
    ]);

    const spentMinor = spendingAgg[0]?.spentMinor || 0;
    const enriched = enrichBudget(budget, spentMinor);

    return res.status(201).json({
      message: 'Budget created successfully',
      budget: enriched
    });
  } catch (err) {
    // Handle MongoDB duplicate key index error (E11000)
    if (err.code === 11000) {
      return res.status(409).json({
        message: 'A budget for this category and month already exists. You can edit the existing budget instead.'
      });
    }
    next(err);
  }
};

// PATCH /budgets/:id - Update monthly limit for an existing budget
export const updateBudget = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { limit } = req.body;

    // Validate MongoDB ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid budget ID format' });
    }

    // Find budget ensuring user ownership
    const budget = await Budget.findOne({
      _id: id,
      userId: req.user.id
    });

    if (!budget) {
      return res.status(404).json({
        message: 'Budget not found or you are not authorized to edit it'
      });
    }

    // Update limit in minor units
    budget.limitMinor = toMinorUnits(limit);
    await budget.save();

    // Query current spending to provide accurate updated calculations
    const monthStart = budget.monthStart;
    const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    const spendingAgg = await Transaction.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(req.user.id),
          type: 'expense',
          category: budget.category,
          transactionDate: { $gte: monthStart, $lte: monthEnd }
        }
      },
      {
        $group: {
          _id: null,
          spentMinor: { $sum: '$amountMinor' }
        }
      }
    ]);

    const spentMinor = spendingAgg[0]?.spentMinor || 0;
    const enriched = enrichBudget(budget, spentMinor);

    return res.status(200).json({
      message: 'Budget updated successfully',
      budget: enriched
    });
  } catch (err) {
    next(err);
  }
};

// DELETE /budgets/:id - Remove a budget record with ownership protection
export const deleteBudget = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate MongoDB ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid budget ID format' });
    }

    // Delete budget ensuring strict ownership by authenticated user
    const budget = await Budget.findOneAndDelete({
      _id: id,
      userId: req.user.id
    });

    if (!budget) {
      return res.status(404).json({
        message: 'Budget not found or you are not authorized to delete it'
      });
    }

    return res.status(200).json({
      message: 'Budget deleted successfully',
      id: budget._id.toString()
    });
  } catch (err) {
    next(err);
  }
};

