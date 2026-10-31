import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import Budget from '../models/Budget.js';
import User from '../models/User.js';
import { normalizeToMonthStartUTC } from '../utils/currency.js';
import {
  financialSummarySchema,
  categoryBreakdownSchema,
  monthlyTrendsSchema,
  budgetStatusSchema,
  searchTransactionsSchema,
  chartDataSchema
} from '../validators/copilotValidator.js';

// Helper to construct authenticated user date-filtered $match stage
const buildUserMatchStage = (userId, from, to, type) => {
  const match = {
    userId: new mongoose.Types.ObjectId(userId)
  };
  if (type) {
    match.type = type;
  }
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

// 1. getFinancialSummary - Computes user total income, expenses, and net cash flow with optional month-over-month comparison
export const getFinancialSummary = async (userId, options = {}) => {
  const parsed = financialSummarySchema.parse(options);
  const { from, to, compareWithPreviousMonth } = parsed;

  // Query authenticated user currency preference
  const user = await User.findById(userId).select('currencyCode').lean();
  const currency = user?.currencyCode || 'INR';

  // Current period aggregation
  const matchStage = buildUserMatchStage(userId, from, to);
  const results = await Transaction.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalIncomeMinor: {
          $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amountMinor', 0] }
        },
        totalExpenseMinor: {
          $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amountMinor', 0] }
        },
        transactionCount: { $sum: 1 },
        incomeCount: {
          $sum: { $cond: [{ $eq: ['$type', 'income'] }, 1, 0] }
        },
        expenseCount: {
          $sum: { $cond: [{ $eq: ['$type', 'expense'] }, 1, 0] }
        }
      }
    }
  ]);

  const raw = results[0] || {
    totalIncomeMinor: 0,
    totalExpenseMinor: 0,
    transactionCount: 0,
    incomeCount: 0,
    expenseCount: 0
  };

  const totalIncome = Number((raw.totalIncomeMinor / 100).toFixed(2));
  const totalExpense = Number((raw.totalExpenseMinor / 100).toFixed(2));
  // Net cash flow formula: Income - Expenses
  const netCashFlow = Number((totalIncome - totalExpense).toFixed(2));
  const netCashFlowMinor = raw.totalIncomeMinor - raw.totalExpenseMinor;

  const response = {
    period: {
      from: from || null,
      to: to || null
    },
    totalIncome,
    totalExpense,
    netCashFlow,
    totalIncomeMinor: raw.totalIncomeMinor,
    totalExpenseMinor: raw.totalExpenseMinor,
    netCashFlowMinor,
    transactionCount: raw.transactionCount,
    incomeCount: raw.incomeCount,
    expenseCount: raw.expenseCount,
    currency
  };

  // Optional previous period comparison
  if (compareWithPreviousMonth) {
    const now = new Date();
    const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0));
    const prevMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999));

    const prevResults = await Transaction.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          transactionDate: { $gte: prevMonthStart, $lte: prevMonthEnd }
        }
      },
      {
        $group: {
          _id: null,
          prevIncomeMinor: {
            $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amountMinor', 0] }
          },
          prevExpenseMinor: {
            $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amountMinor', 0] }
          }
        }
      }
    ]);

    const prevRaw = prevResults[0] || { prevIncomeMinor: 0, prevExpenseMinor: 0 };
    const prevIncome = Number((prevRaw.prevIncomeMinor / 100).toFixed(2));
    const prevExpense = Number((prevRaw.prevExpenseMinor / 100).toFixed(2));
    const prevNetCashFlow = Number((prevIncome - prevExpense).toFixed(2));

    const expenseDelta = Number((totalExpense - prevExpense).toFixed(2));
    const incomeDelta = Number((totalIncome - prevIncome).toFixed(2));
    const expenseChangePercent = prevExpense > 0
      ? Number((((totalExpense - prevExpense) / prevExpense) * 100).toFixed(1))
      : (totalExpense > 0 ? 100 : 0);

    response.comparison = {
      previousMonth: {
        totalIncome: prevIncome,
        totalExpense: prevExpense,
        netCashFlow: prevNetCashFlow
      },
      expenseDelta,
      incomeDelta,
      expenseChangePercent,
      netCashFlowDelta: Number((netCashFlow - prevNetCashFlow).toFixed(2))
    };
  }

  return response;
};

// 2. getCategoryBreakdown - Computes category distribution, percentage shares, and top expense category
export const getCategoryBreakdown = async (userId, options = {}) => {
  const parsed = categoryBreakdownSchema.parse(options);
  const { from, to, type } = parsed;

  const matchStage = buildUserMatchStage(userId, from, to, type);
  const aggregatedCategories = await Transaction.aggregate([
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

  const totalAmountMinor = aggregatedCategories.reduce((sum, item) => sum + item.amountMinor, 0);
  const totalAmount = Number((totalAmountMinor / 100).toFixed(2));

  const categories = aggregatedCategories.map((item) => {
    const amount = Number((item.amountMinor / 100).toFixed(2));
    const percentage = totalAmountMinor > 0
      ? Number(((item.amountMinor / totalAmountMinor) * 100).toFixed(1))
      : 0;
    return {
      category: item._id,
      amount,
      amountMinor: item.amountMinor,
      count: item.count,
      percentage
    };
  });

  const topCategory = categories.length > 0 ? categories[0] : null;

  return {
    period: { from: from || null, to: to || null },
    type,
    totalAmount,
    totalAmountMinor,
    categoryCount: categories.length,
    topCategory,
    categories
  };
};

// 3. getMonthlyTrends - Computes monthly income, expenses, and net cash flow trends over requested months
export const getMonthlyTrends = async (userId, options = {}) => {
  const parsed = monthlyTrendsSchema.parse(options);
  const { months, from, to } = parsed;

  let startDate;
  let endDate;

  if (from && to) {
    startDate = new Date(from);
    endDate = new Date(to);
    if (to.length === 10) endDate.setUTCHours(23, 59, 59, 999);
  } else {
    const now = new Date();
    startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1, 0, 0, 0));
    endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  }

  const results = await Transaction.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        transactionDate: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$transactionDate', timezone: 'UTC' } },
        incomeMinor: {
          $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amountMinor', 0] }
        },
        expenseMinor: {
          $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amountMinor', 0] }
        },
        transactionCount: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const trends = results.map((item) => {
    const income = Number((item.incomeMinor / 100).toFixed(2));
    const expense = Number((item.expenseMinor / 100).toFixed(2));
    return {
      month: item._id,
      income,
      expense,
      netCashFlow: Number((income - expense).toFixed(2)),
      transactionCount: item.transactionCount
    };
  });

  // Calculate averages across available trend months
  const totalMonths = trends.length || 1;
  const avgIncome = Number((trends.reduce((s, t) => s + t.income, 0) / totalMonths).toFixed(2));
  const avgExpense = Number((trends.reduce((s, t) => s + t.expense, 0) / totalMonths).toFixed(2));

  // Determine peak expense month
  let highestExpenseMonth = null;
  if (trends.length > 0) {
    highestExpenseMonth = [...trends].sort((a, b) => b.expense - a.expense)[0];
  }

  return {
    monthsRequested: months,
    trends,
    averages: {
      averageMonthlyIncome: avgIncome,
      averageMonthlyExpense: avgExpense,
      averageMonthlyNetCashFlow: Number((avgIncome - avgExpense).toFixed(2))
    },
    highestExpenseMonth
  };
};

// 4. getBudgetStatus - Checks monthly category limits, actual spending, and detects overspending
export const getBudgetStatus = async (userId, options = {}) => {
  const parsed = budgetStatusSchema.parse(options);
  const { month } = parsed;

  const targetDate = month ? (month.length === 7 ? `${month}-01` : month) : new Date();
  const monthStart = normalizeToMonthStartUTC(targetDate);
  const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  const monthKey = monthStart.toISOString().slice(0, 7);

  // Fetch configured budgets for the target month
  const budgets = await Budget.find({
    userId,
    monthStart
  }).sort({ createdAt: -1 });

  // Aggregate user expense spending for the same month period
  const spendingData = await Transaction.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        type: 'expense',
        transactionDate: { $gte: monthStart, $lte: monthEnd }
      }
    },
    {
      $group: {
        _id: '$category',
        spentMinor: { $sum: '$amountMinor' }
      }
    }
  ]);

  const spendingMap = new Map();
  spendingData.forEach((s) => spendingMap.set(s._id, s.spentMinor));

  const enrichedBudgets = budgets.map((b) => {
    const spentMinor = spendingMap.get(b.category) || 0;
    const limitMinor = b.limitMinor;
    const limit = Number((limitMinor / 100).toFixed(2));
    const spent = Number((spentMinor / 100).toFixed(2));
    // Remaining budget formula: Limit - Category Spending
    const remaining = Number(((limitMinor - spentMinor) / 100).toFixed(2));
    const percentage = limit > 0 ? Number(((spent / limit) * 100).toFixed(1)) : 0;
    const isOverBudget = spentMinor > limitMinor;
    const overBy = isOverBudget ? Number(((spentMinor - limitMinor) / 100).toFixed(2)) : 0;
    const isNearLimit = percentage >= 75 && percentage < 100;

    return {
      id: b._id.toString(),
      category: b.category,
      limit,
      spent,
      remaining,
      percentage,
      isOverBudget,
      overBy,
      isNearLimit
    };
  });

  const totalBudgeted = Number((enrichedBudgets.reduce((s, b) => s + b.limit, 0)).toFixed(2));
  const totalSpent = Number((enrichedBudgets.reduce((s, b) => s + b.spent, 0)).toFixed(2));
  const totalRemaining = Number((totalBudgeted - totalSpent).toFixed(2));
  const overallPercentage = totalBudgeted > 0
    ? Number(((totalSpent / totalBudgeted) * 100).toFixed(1))
    : 0;

  const exceededBudgets = enrichedBudgets.filter((b) => b.isOverBudget);
  const nearLimitBudgets = enrichedBudgets.filter((b) => b.isNearLimit);
  const healthyBudgets = enrichedBudgets.filter((b) => !b.isOverBudget && !b.isNearLimit);

  return {
    month: monthKey,
    totalBudgeted,
    totalSpent,
    totalRemaining,
    overallPercentage,
    hasExceededBudgets: exceededBudgets.length > 0,
    exceededCount: exceededBudgets.length,
    nearLimitCount: nearLimitBudgets.length,
    exceededBudgets,
    nearLimitBudgets,
    healthyBudgets,
    budgets: enrichedBudgets
  };
};

// 5. searchTransactions - Queries filtered transactions with controlled limits and lean data returns
export const searchTransactions = async (userId, options = {}) => {
  const parsed = searchTransactionsSchema.parse(options);
  const { from, to, category, type, sort, limit } = parsed;

  const match = {
    userId: new mongoose.Types.ObjectId(userId)
  };

  if (type) match.type = type;
  if (category) match.category = category;
  if (from || to) {
    match.transactionDate = {};
    if (from) match.transactionDate.$gte = new Date(from);
    if (to) {
      const toDate = new Date(to);
      if (to.length === 10) toDate.setUTCHours(23, 59, 59, 999);
      match.transactionDate.$lte = toDate;
    }
  }

  // Sort criteria mapping
  const sortMap = {
    amount_desc: { amountMinor: -1, transactionDate: -1 },
    amount_asc: { amountMinor: 1, transactionDate: -1 },
    date_desc: { transactionDate: -1, _id: -1 },
    date_asc: { transactionDate: 1, _id: 1 }
  };

  const selectedSort = sortMap[sort] || sortMap.amount_desc;

  // Retrieve lean transaction documents
  const items = await Transaction.find(match)
    .sort(selectedSort)
    .limit(limit)
    .select('_id transactionDate type category amountMinor currencyCode notes')
    .lean();

  const transactions = items.map((t) => ({
    id: t._id.toString(),
    transactionDate: t.transactionDate,
    type: t.type,
    category: t.category,
    amount: Number((t.amountMinor / 100).toFixed(2)),
    amountMinor: t.amountMinor,
    currencyCode: t.currencyCode || 'INR',
    notes: t.notes || ''
  }));

  return {
    count: transactions.length,
    limit,
    sort,
    transactions
  };
};

// 6. getChartData - Authoritatively loads chart data directly from MongoDB rather than trusting client totals
export const getChartData = async (userId, options = {}) => {
  const parsed = chartDataSchema.parse(options);
  const { chartType, filters } = parsed;

  if (chartType === 'category_breakdown') {
    const data = await getCategoryBreakdown(userId, {
      from: filters?.from,
      to: filters?.to,
      type: 'expense'
    });
    return {
      chartType,
      filtersApplied: filters,
      authoritativeData: data.categories,
      insights: {
        summary: data.topCategory
          ? `Highest expense is ${data.topCategory.category.replace(/_/g, ' ')} accounting for ${data.topCategory.percentage}% of total spending.`
          : 'No category spending recorded for this timeframe.',
        totalExpense: data.totalAmount,
        topCategory: data.topCategory
      }
    };
  }

  if (chartType === 'net_cash_flow_trend') {
    const data = await getMonthlyTrends(userId, {
      months: filters?.months || 6,
      from: filters?.from,
      to: filters?.to
    });
    const positiveMonths = data.trends.filter((t) => t.netCashFlow >= 0).length;
    return {
      chartType,
      filtersApplied: filters,
      authoritativeData: data.trends.map((t) => ({
        month: t.month,
        netCashFlow: t.netCashFlow
      })),
      insights: {
        summary: `Over ${data.trends.length} months, you generated positive net cash flow in ${positiveMonths} of those months.`,
        averageNetCashFlow: data.averages.averageMonthlyNetCashFlow
      }
    };
  }

  // Default: monthly_comparison
  const data = await getMonthlyTrends(userId, {
    months: filters?.months || 6,
    from: filters?.from,
    to: filters?.to
  });
  return {
    chartType: 'monthly_comparison',
    filtersApplied: filters,
    authoritativeData: data.trends,
    insights: {
      summary: data.highestExpenseMonth
        ? `Peak spending occurred in ${data.highestExpenseMonth.month} with recorded expenses of ₹${data.highestExpenseMonth.expense.toLocaleString('en-IN')}.`
        : 'No monthly trends available yet.',
      averageMonthlyExpense: data.averages.averageMonthlyExpense,
      averageMonthlyIncome: data.averages.averageMonthlyIncome
    }
  };
};

// 7. resolveFinancialQuestion - Intelligent dispatcher matching common financial questions to authoritative verified services
export const resolveFinancialQuestion = async (userId, { question = '', action, chartType, filters = {} }) => {
  const q = question.toLowerCase().trim();

  // Route 1: Largest expenses query
  if (action === 'search_transactions' || q.includes('largest expense') || q.includes('highest transaction')) {
    const result = await searchTransactions(userId, {
      ...filters,
      type: 'expense',
      sort: 'amount_desc',
      limit: filters.limit || 5
    });
    return {
      intent: 'largest_expenses',
      question,
      context: result,
      summary: result.transactions.length > 0
        ? `Found ${result.transactions.length} largest recorded expenses in the selected period. Top expense is ${result.transactions[0].category.replace(/_/g, ' ')} for ₹${result.transactions[0].amount.toLocaleString('en-IN')}.`
        : 'No expense transactions recorded in this date range.'
    };
  }

  // Route 2: Category breakdown / highest expense category
  if (action === 'category_breakdown' || q.includes('highest expense') || q.includes('which category') || q.includes('category accounted')) {
    const result = await getCategoryBreakdown(userId, {
      from: filters.from,
      to: filters.to,
      type: 'expense'
    });
    return {
      intent: 'highest_expense_category',
      question,
      context: result,
      summary: result.topCategory
        ? `The highest expense category was ${result.topCategory.category.replace(/_/g, ' ')} at ₹${result.topCategory.amount.toLocaleString('en-IN')} (${result.topCategory.percentage}% of all expenses).`
        : 'No expense categories found for this period.'
    };
  }

  // Route 3: Budget status / exceeding budgets
  if (action === 'budget_status' || q.includes('exceeding') || q.includes('budget') || q.includes('over budget')) {
    const result = await getBudgetStatus(userId, { month: filters.month });
    return {
      intent: 'budget_status',
      question,
      context: result,
      summary: result.hasExceededBudgets
        ? `You are currently exceeding ${result.exceededCount} budget(s): ${result.exceededBudgets.map((b) => `${b.category.replace(/_/g, ' ')} (over by ₹${b.overBy})`).join(', ')}.`
        : `All category budgets are within limits for ${result.month}. Total spent is ₹${result.totalSpent.toLocaleString('en-IN')} of ₹${result.totalBudgeted.toLocaleString('en-IN')} limit.`
    };
  }

  // Route 4: Month comparison / compare this month with last month
  if (q.includes('compare') || q.includes('last month') || q.includes('previous month')) {
    const result = await getFinancialSummary(userId, { ...filters, compareWithPreviousMonth: true });
    const deltaText = result.comparison?.expenseDelta >= 0 ? 'more' : 'less';
    return {
      intent: 'monthly_comparison',
      question,
      context: result,
      summary: result.comparison
        ? `This month you recorded ₹${result.totalExpense.toLocaleString('en-IN')} in expenses compared to ₹${result.comparison.previousMonth.totalExpense.toLocaleString('en-IN')} last month (₹${Math.abs(result.comparison.expenseDelta)} ${deltaText}).`
        : `Recorded expenses: ₹${result.totalExpense.toLocaleString('en-IN')}, income: ₹${result.totalIncome.toLocaleString('en-IN')}.`
    };
  }

  // Route 5: Spending chart insights
  if (action === 'chart_data' || q.includes('chart tell') || q.includes('chart') || q.includes('spending chart')) {
    const targetChart = chartType || 'monthly_comparison';
    const result = await getChartData(userId, { chartType: targetChart, filters });
    return {
      intent: 'chart_insights',
      question,
      context: result,
      summary: result.insights?.summary || 'Authoritative chart dataset loaded from database.'
    };
  }

  // Route 6: Difference between income and expenses / net cash flow
  if (q.includes('difference') || q.includes('net cash flow') || q.includes('balance') || q.includes('how much did i spend')) {
    const result = await getFinancialSummary(userId, filters);
    return {
      intent: 'financial_summary',
      question,
      context: result,
      summary: `Your recorded income is ₹${result.totalIncome.toLocaleString('en-IN')} and expenses are ₹${result.totalExpense.toLocaleString('en-IN')}. Your net cash flow (recorded balance) is ₹${result.netCashFlow.toLocaleString('en-IN')}.`
    };
  }

  // Default: General comprehensive financial context
  const [summary, breakdown, budgets] = await Promise.all([
    getFinancialSummary(userId, filters),
    getCategoryBreakdown(userId, { ...filters, type: 'expense' }),
    getBudgetStatus(userId, { month: filters.month })
  ]);

  return {
    intent: 'general_context',
    question,
    context: { summary, breakdown, budgets },
    summary: `Recorded overview: ₹${summary.totalIncome.toLocaleString('en-IN')} income, ₹${summary.totalExpense.toLocaleString('en-IN')} expenses, net cash flow ₹${summary.netCashFlow.toLocaleString('en-IN')}. Top expense category: ${breakdown.topCategory?.category.replace(/_/g, ' ') || 'None'}.`
  };
};

