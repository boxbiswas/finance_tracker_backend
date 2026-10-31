import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';

// Helper to construct authenticated user date-filtered $match stage
const buildMatchStage = (userId, from, to, type) => {
  // Enforce authenticated userId as ObjectId
  const match = {
    userId: new mongoose.Types.ObjectId(userId)
  };

  // Add transaction type filter if specified
  if (type) {
    match.type = type;
  }

  // Add date range filtering if from or to boundaries exist
  if (from || to) {
    match.transactionDate = {};
    if (from) {
      match.transactionDate.$gte = new Date(from);
    }
    if (to) {
      const toDate = new Date(to);
      if (to.length === 10) {
        toDate.setUTCHours(23, 59, 59, 999);
      }
      match.transactionDate.$lte = toDate;
    }
  }

  return match;
};

// GET /analytics/summary - High level income, expenses, and net cash flow summary via aggregation
export const getSummary = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const matchStage = buildMatchStage(req.user.id, from, to);

    // MongoDB aggregation pipeline to compute totals without client memory overhead
    const results = await Transaction.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalIncomeMinor: {
            $sum: {
              $cond: [{ $eq: ['$type', 'income'] }, '$amountMinor', 0]
            }
          },
          totalExpenseMinor: {
            $sum: {
              $cond: [{ $eq: ['$type', 'expense'] }, '$amountMinor', 0]
            }
          },
          transactionCount: { $sum: 1 },
          incomeCount: {
            $sum: {
              $cond: [{ $eq: ['$type', 'income'] }, 1, 0]
            }
          },
          expenseCount: {
            $sum: {
              $cond: [{ $eq: ['$type', 'expense'] }, 1, 0]
            }
          }
        }
      }
    ]);

    // Handle empty state gracefully
    const data = results[0] || {
      totalIncomeMinor: 0,
      totalExpenseMinor: 0,
      transactionCount: 0,
      incomeCount: 0,
      expenseCount: 0
    };

    const totalIncome = data.totalIncomeMinor / 100;
    const totalExpense = data.totalExpenseMinor / 100;
    const netCashFlow = (data.totalIncomeMinor - data.totalExpenseMinor) / 100;

    return res.status(200).json({
      summary: {
        totalIncome,
        totalExpense,
        netCashFlow,
        balance: netCashFlow,
        totalIncomeMinor: data.totalIncomeMinor,
        totalExpenseMinor: data.totalExpenseMinor,
        transactionCount: data.transactionCount,
        incomeCount: data.incomeCount,
        expenseCount: data.expenseCount
      }
    });
  } catch (err) {
    next(err);
  }
};

// GET /analytics/category-breakdown - Group spend or earnings by category with percentage distribution
export const getCategoryBreakdown = async (req, res, next) => {
  try {
    const { from, to, type = 'expense' } = req.query;
    const matchStage = buildMatchStage(req.user.id, from, to, type);

    // MongoDB aggregation pipeline to group by category and compute category sums
    const categories = await Transaction.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$category',
          amountMinor: { $sum: '$amountMinor' },
          count: { $sum: 1 }
        }
      },
      { $sort: { amountMinor: -1 } }
    ]);

    // Calculate overall total across all categories to determine accurate percentages
    const totalMinor = categories.reduce((sum, item) => sum + item.amountMinor, 0);

    const formattedCategories = categories.map((item) => ({
      category: item._id,
      amountMinor: item.amountMinor,
      amount: item.amountMinor / 100,
      count: item.count,
      percentage: totalMinor > 0 ? Number(((item.amountMinor / totalMinor) * 100).toFixed(1)) : 0
    }));

    return res.status(200).json({
      type,
      total: totalMinor / 100,
      totalMinor,
      categories: formattedCategories
    });
  } catch (err) {
    next(err);
  }
};

// GET /analytics/monthly-trends - Aggregates monthly income vs expenses for bar and line charts
export const getMonthlyTrends = async (req, res, next) => {
  try {
    const { from, to, months = 6 } = req.query;

    // Default to last N months if no explicit date range provided
    let matchStage;
    if (from || to) {
      matchStage = buildMatchStage(req.user.id, from, to);
    } else {
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - (months - 1));
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);

      matchStage = {
        userId: new mongoose.Types.ObjectId(req.user.id),
        transactionDate: { $gte: startDate }
      };
    }

    // Aggregation pipeline grouping transactions by YYYY-MM
    const monthlyData = await Transaction.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m', date: '$transactionDate' }
          },
          incomeMinor: {
            $sum: {
              $cond: [{ $eq: ['$type', 'income'] }, '$amountMinor', 0]
            }
          },
          expenseMinor: {
            $sum: {
              $cond: [{ $eq: ['$type', 'expense'] }, '$amountMinor', 0]
            }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Month formatting helper (e.g. 2026-10 -> Oct 2026)
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Map monthly data into frontend-ready chart items
    const trends = monthlyData.map((item) => {
      const [year, monthNum] = item._id.split('-');
      const monthIndex = parseInt(monthNum, 10) - 1;
      const label = `${monthNames[monthIndex] || monthNum} ${year}`;
      const income = item.incomeMinor / 100;
      const expense = item.expenseMinor / 100;

      return {
        month: item._id,
        label,
        income,
        expense,
        netCashFlow: income - expense,
        incomeMinor: item.incomeMinor,
        expenseMinor: item.expenseMinor,
        count: item.count
      };
    });

    return res.status(200).json({
      monthsCount: trends.length,
      trends
    });
  } catch (err) {
    next(err);
  }
};
