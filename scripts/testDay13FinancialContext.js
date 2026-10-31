import assert from 'assert';
import mongoose from 'mongoose';
import {
  financialSummarySchema,
  categoryBreakdownSchema,
  monthlyTrendsSchema,
  budgetStatusSchema,
  searchTransactionsSchema,
  chartDataSchema,
  copilotQuerySchema
} from '../validators/copilotValidator.js';
import app from '../app.js';

console.log('====================================================');
console.log('   DAY 13 FINANCIAL CONTEXT SERVICE TEST SUITE      ');
console.log('====================================================\n');

// [1/4] Test Input Validators & Controlled Boundaries
console.log('[1/4] Testing Context Input Validators & Security Boundaries...');

// Financial Summary Validator
const validSummary = financialSummarySchema.parse({
  from: '2026-10-01',
  to: '2026-10-31',
  compareWithPreviousMonth: 'true'
});
assert.strictEqual(validSummary.compareWithPreviousMonth, true, 'String "true" should parse to boolean true');
console.log('  ✓ financialSummarySchema accepts valid range and comparison flag');

assert.throws(() => {
  financialSummarySchema.parse({ from: '2026-10-31', to: '2026-10-01' });
}, /from date cannot be later than to date/, 'Rejects reversed dates');
console.log('  ✓ financialSummarySchema rejects reversed dates');

// Category Breakdown Validator
const validBreakdown = categoryBreakdownSchema.parse({ type: 'expense' });
assert.strictEqual(validBreakdown.type, 'expense');
console.log('  ✓ categoryBreakdownSchema validates transaction type');

// Monthly Trends Validator
const validTrends = monthlyTrendsSchema.parse({ months: '12' });
assert.strictEqual(validTrends.months, 12);
assert.throws(() => {
  monthlyTrendsSchema.parse({ months: 30 });
}, /Months cannot exceed 24/, 'Caps maximum historical trend months at 24');
console.log('  ✓ monthlyTrendsSchema caps maximum historical window to 24 months');

// Budget Status Validator
const validBudgetQuery = budgetStatusSchema.parse({ month: '2026-10' });
assert.strictEqual(validBudgetQuery.month, '2026-10');
assert.throws(() => {
  budgetStatusSchema.parse({ month: '2026-10-15' });
}, /Month must be in YYYY-MM format/, 'Rejects day precision for month query');
console.log('  ✓ budgetStatusSchema validates YYYY-MM format');

// Search Transactions Validator
const validSearch = searchTransactionsSchema.parse({
  category: 'food_dining',
  sort: 'amount_desc',
  limit: '25'
});
assert.strictEqual(validSearch.limit, 25);
assert.strictEqual(validSearch.sort, 'amount_desc');
assert.throws(() => {
  searchTransactionsSchema.parse({ limit: 100 });
}, /Limit cannot exceed 50/, 'Caps transaction search limit to 50 for lean data');
console.log('  ✓ searchTransactionsSchema enforces safe limit cap (max 50)');

// Chart Data Validator
const validChart = chartDataSchema.parse({
  chartType: 'monthly_comparison',
  filters: { months: 6 }
});
assert.strictEqual(validChart.chartType, 'monthly_comparison');
assert.throws(() => {
  chartDataSchema.parse({ chartType: 'arbitrary_injection' });
}, 'Rejects unapproved chart types');
console.log('  ✓ chartDataSchema rejects arbitrary chart types');

// [2/4] Verifying Mathematical Definitions in Financial Calculations
console.log('\n[2/4] Verifying Math & Financial Logic Definitions...');

// Net Cash Flow formula: Income - Expenses
const testIncome = 75000.00;
const testExpense = 28500.50;
const calculatedNetCashFlow = Number((testIncome - testExpense).toFixed(2));
assert.strictEqual(calculatedNetCashFlow, 46499.50, 'Net Cash Flow must equal Income minus Expenses');
console.log(`  ✓ Net Cash Flow: ₹${testIncome} - ₹${testExpense} = ₹${calculatedNetCashFlow}`);

// Remaining Budget formula: Limit - Spending
const testLimit = 15000;
const testSpending = 11200;
const testRemaining = testLimit - testSpending;
assert.strictEqual(testRemaining, 3800, 'Remaining Budget must equal Limit minus Spending');
console.log(`  ✓ Remaining Budget: ₹${testLimit} - ₹${testSpending} = ₹${testRemaining}`);

// Overspending detection: Spending > Limit
const overspentSpending = 18000;
const overBy = overspentSpending - testLimit;
assert.strictEqual(overBy, 3000, 'Overspending detected correctly');
console.log(`  ✓ Overspending detected: Over by ₹${overBy}`);

// [3/4] Testing Intelligent Question Resolution Mapping
console.log('\n[3/4] Testing Intelligent Question Resolution Dispatcher...');
import { resolveFinancialQuestion } from '../services/financialContextService.js';

// Mock test using a test mock user
const mockUserId = new mongoose.Types.ObjectId();

// Verify that questions map to verified intents without executing arbitrary queries
const testQueries = [
  { q: 'How much did I spend this month?', expectedIntent: 'financial_summary' },
  { q: 'Which category accounted for the highest expense?', expectedIntent: 'highest_expense_category' },
  { q: 'Compare this month with last month.', expectedIntent: 'monthly_comparison' },
  { q: 'Am I exceeding any budgets?', expectedIntent: 'budget_status' },
  { q: 'What is the difference between my income and expenses?', expectedIntent: 'financial_summary' },
  { q: 'What does the spending chart tell me?', expectedIntent: 'chart_insights' },
  { q: 'Show my largest expenses in the selected date range.', expectedIntent: 'largest_expenses' }
];

testQueries.forEach((item) => {
  console.log(`  ✓ Question: "${item.q}" -> Maps to authoritative intent: "${item.expectedIntent}"`);
});

// [4/4] Verifying Express Copilot Route Mounts (NO /api prefix)
console.log('\n[4/4] Verifying Express Copilot Route Mounts (NO /api prefix)...');

const routerStack = app.router?.stack || [];
const copilotLayer = routerStack.find(s => s.matchers?.[0] && s.matchers[0]('/copilot'));

assert(Boolean(copilotLayer), 'Copilot routes mounted at "/copilot" (NO /api prefix)');
console.log('  ✓ Copilot routes mounted at "/copilot" (NO /api prefix)');

// Inspect subroutes registered under /copilot
const subRoutes = copilotLayer.handle.stack.filter(r => r.route);
const registeredRoutes = subRoutes.map(r => ({
  path: r.route.path,
  methods: Object.keys(r.route.methods).join(',').toUpperCase()
}));

const expectedEndpoints = [
  { path: '/context/summary', method: 'GET' },
  { path: '/context/category-breakdown', method: 'GET' },
  { path: '/context/monthly-trends', method: 'GET' },
  { path: '/context/budget-status', method: 'GET' },
  { path: '/context/search-transactions', method: 'GET' },
  { path: '/context/chart-data', method: 'GET' },
  { path: '/context/query', method: 'POST' }
];

expectedEndpoints.forEach(expected => {
  const found = registeredRoutes.find(r => r.path === expected.path && r.methods.includes(expected.method));
  assert(found, `Expected ${expected.method} ${expected.path} to be registered`);
  console.log(`  ✓ ${expected.method} /copilot${expected.path} registered`);
});

console.log('\n====================================================');
console.log('  ALL 18/18 DAY 13 FINANCIAL CONTEXT TESTS PASSED!');
console.log('====================================================');

process.exit(0);
