import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import Budget from '../models/Budget.js';
import { normalizeToMonthStartUTC } from '../utils/currency.js';

// Financial Analytics Service: Computes authoritative, deep financial insights from MongoDB for Copilot
export const getAuthorizedAnalytics = async (userId, filters = {}) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const now = new Date();

  // Current month boundaries in UTC
  const currentMonthStart = normalizeToMonthStartUTC(now);
  const currentMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

  // Previous month boundaries in UTC for comparative analytics
  const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0));
  const prevMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999));

  // 1. Current Month Totals Aggregation
  const currentTotals = await Transaction.aggregate([
    {
      $match: {
        userId: userObjectId,
        transactionDate: { $gte: currentMonthStart, $lte: currentMonthEnd }
      }
    },
    {
      $group: {
        _id: null,
        incomeMinor: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amountMinor', 0] } },
        expenseMinor: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amountMinor', 0] } },
        transactionCount: { $sum: 1 }
      }
    }
  ]);

  const curr = currentTotals[0] || { incomeMinor: 0, expenseMinor: 0, transactionCount: 0 };
  const currentIncome = Number((curr.incomeMinor / 100).toFixed(2));
  const currentExpense = Number((curr.expenseMinor / 100).toFixed(2));
  // Net cash flow formula: Income - Expenses
  const currentNetCashFlow = Number((currentIncome - currentExpense).toFixed(2));

  // Savings Rate formula: (Net Cash Flow / Income) * 100 if Income > 0
  const savingsRate = currentIncome > 0
    ? Number(((currentNetCashFlow / currentIncome) * 100).toFixed(1))
    : 0;

  // 2. Previous Month Totals for MoM Variance
  const prevTotals = await Transaction.aggregate([
    {
      $match: {
        userId: userObjectId,
        transactionDate: { $gte: prevMonthStart, $lte: prevMonthEnd }
      }
    },
    {
      $group: {
        _id: null,
        incomeMinor: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amountMinor', 0] } },
        expenseMinor: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amountMinor', 0] } }
      }
    }
  ]);

  const prev = prevTotals[0] || { incomeMinor: 0, expenseMinor: 0 };
  const prevExpense = Number((prev.expenseMinor / 100).toFixed(2));
  const expenseChangePercent = prevExpense > 0
    ? Number((((currentExpense - prevExpense) / prevExpense) * 100).toFixed(1))
    : (currentExpense > 0 ? 100 : 0);

  // 3. Category Spending Breakdown for Current Month
  const categoryAgg = await Transaction.aggregate([
    {
      $match: {
        userId: userObjectId,
        type: 'expense',
        transactionDate: { $gte: currentMonthStart, $lte: currentMonthEnd }
      }
    },
    {
      $group: {
        _id: '$category',
        totalMinor: { $sum: '$amountMinor' },
        count: { $sum: 1 }
      }
    },
    { $sort: { totalMinor: -1 } }
  ]);

  const categories = categoryAgg.map((c) => {
    const amount = Number((c.totalMinor / 100).toFixed(2));
    const percentage = curr.expenseMinor > 0
      ? Number(((c.totalMinor / curr.expenseMinor) * 100).toFixed(1))
      : 0;
    return {
      category: c._id,
      amount,
      count: c.count,
      percentage
    };
  });

  const topCategory = categories[0] || null;
  const top3ExpenseRatio = categories.slice(0, 3).reduce((sum, c) => sum + c.percentage, 0);

  // 4. Budget Adherence Analytics
  const activeBudgets = await Budget.find({
    userId: userObjectId,
    monthStart: currentMonthStart
  }).lean();

  const spendingMap = new Map();
  categoryAgg.forEach((c) => spendingMap.set(c._id, c.totalMinor));

  let exceededCount = 0;
  let nearLimitCount = 0;
  let totalBudgetedMinor = 0;
  let totalBudgetedSpentMinor = 0;

  const budgetBreakdowns = activeBudgets.map((b) => {
    const spentMinor = spendingMap.get(b.category) || 0;
    totalBudgetedMinor += b.limitMinor;
    totalBudgetedSpentMinor += spentMinor;

    const isOver = spentMinor > b.limitMinor;
    const percentage = b.limitMinor > 0 ? Number(((spentMinor / b.limitMinor) * 100).toFixed(1)) : 0;
    if (isOver) exceededCount += 1;
    else if (percentage >= 75) nearLimitCount += 1;

    return {
      category: b.category,
      limit: Number((b.limitMinor / 100).toFixed(2)),
      spent: Number((spentMinor / 100).toFixed(2)),
      remaining: Number(((b.limitMinor - spentMinor) / 100).toFixed(2)),
      percentage,
      isOverBudget: isOver,
      overBy: isOver ? Number(((spentMinor - b.limitMinor) / 100).toFixed(2)) : 0
    };
  });

  const totalBudgets = activeBudgets.length;
  const budgetAdherenceScore = totalBudgets > 0
    ? Number((((totalBudgets - exceededCount) / totalBudgets) * 100).toFixed(1))
    : 100;

  return {
    month: currentMonthStart.toISOString().slice(0, 7),
    currentMonth: {
      income: currentIncome,
      expense: currentExpense,
      netCashFlow: currentNetCashFlow,
      transactionCount: curr.transactionCount,
      savingsRate
    },
    monthOverMonth: {
      previousExpense: prevExpense,
      expenseDelta: Number((currentExpense - prevExpense).toFixed(2)),
      expenseChangePercent
    },
    spendingConcentration: {
      topCategory,
      top3Percentage: Number(top3ExpenseRatio.toFixed(1)),
      categoryCount: categories.length,
      categories
    },
    budgetAdherence: {
      totalBudgets,
      exceededCount,
      nearLimitCount,
      budgetAdherenceScore,
      totalLimit: Number((totalBudgetedMinor / 100).toFixed(2)),
      totalSpent: Number((totalBudgetedSpentMinor / 100).toFixed(2)),
      budgets: budgetBreakdowns
    }
  };
};

