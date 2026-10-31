import { createTransactionSchema, queryTransactionSchema } from '../validators/transactionValidator.js';
import { toMinorUnits, toMajorUnits } from '../utils/currency.js';
import app from '../app.js';

console.log('====================================================');
console.log('   DAY 6 TRANSACTION VALIDATION & LOGIC TEST SUITE   ');
console.log('====================================================\n');

let total = 0;
let passed = 0;

const assert = (condition, description) => {
  total++;
  if (!condition) {
    console.error(`❌ FAIL: ${description}`);
    process.exit(1);
  }
  passed++;
  console.log(`  ✓ ${description}`);
};

// 1. Transaction Creation Validation Tests
console.log('[1/4] Testing createTransactionSchema...');

// Incompatible category for type: salary under expense
const testIncompatible = createTransactionSchema.safeParse({
  type: 'expense',
  amount: 500,
  category: 'salary'
});
assert(!testIncompatible.success, 'Rejects incompatible category (salary under expense)');

// Compatible category for income
const testValidIncome = createTransactionSchema.safeParse({
  type: 'income',
  amount: 60000.50,
  category: 'salary',
  notes: 'Monthly earnings'
});
assert(testValidIncome.success, 'Accepts valid income transaction');

// Compatible category for expense
const testValidExpense = createTransactionSchema.safeParse({
  type: 'expense',
  amount: '3450.25',
  category: 'food_dining',
  transactionDate: '2026-10-15'
});
assert(testValidExpense.success, 'Accepts valid expense transaction with string amount');
assert(testValidExpense.data?.amount === 3450.25, 'String amount is parsed into numeric float');

// Negative amount rejection
const testNegative = createTransactionSchema.safeParse({
  type: 'expense',
  amount: -100,
  category: 'food_dining'
});
assert(!testNegative.success, 'Rejects negative amount');

// Zero amount rejection
const testZero = createTransactionSchema.safeParse({
  type: 'income',
  amount: 0,
  category: 'salary'
});
assert(!testZero.success, 'Rejects zero amount');
console.log('');

// 2. Query Filtering & Pagination Validation Tests
console.log('[2/4] Testing queryTransactionSchema...');

// Valid query with date range
const testValidQuery = queryTransactionSchema.safeParse({
  from: '2026-10-01',
  to: '2026-10-31',
  type: 'income',
  category: 'salary',
  page: '2',
  limit: '20',
  sort: 'amount_desc'
});
assert(testValidQuery.success, 'Accepts valid query parameters');
assert(testValidQuery.data?.page === 2, 'Page string "2" transformed to integer 2');
assert(testValidQuery.data?.limit === 20, 'Limit string "20" transformed to integer 20');
assert(testValidQuery.data?.sort === 'amount_desc', 'Sort parameter set to amount_desc');

// Default pagination values
const testDefaultQuery = queryTransactionSchema.safeParse({});
assert(testDefaultQuery.success, 'Accepts empty query with defaults');
assert(testDefaultQuery.data?.page === 1, 'Default page is 1');
assert(testDefaultQuery.data?.limit === 10, 'Default limit is 10');
assert(testDefaultQuery.data?.sort === 'date_desc', 'Default sort is date_desc');

// Limit capped at 100
const testMaxLimit = queryTransactionSchema.safeParse({ limit: '250' });
assert(testMaxLimit.success && testMaxLimit.data?.limit === 100, 'Limit is capped at maximum of 100');

// Invalid date range (from > to)
const testInvalidRange = queryTransactionSchema.safeParse({
  from: '2026-10-31',
  to: '2026-10-01'
});
assert(!testInvalidRange.success, 'Rejects date range where "from" date is after "to" date');
console.log('');

// 3. Currency Precision Math
console.log('[3/4] Testing Currency Precision...');
assert(toMinorUnits(125.50) === 12550, '₹125.50 converts to 12550 minor units');
assert(toMinorUnits(0.05) === 5, '₹0.05 converts to 5 minor units');
assert(toMinorUnits(1000) === 100000, '₹1,000 converts to 100000 minor units');
assert(toMajorUnits(12550) === 125.50, '12550 minor units converts back to 125.50');
console.log('');

// 4. Route Registration Verification
console.log('[4/4] Verifying Express Routes Mount...');
const routerStack = app.router?.stack || [];
const transactionLayer = routerStack.find(s => s.matchers?.[0] && s.matchers[0]('/transactions'));
assert(Boolean(transactionLayer), 'Routes mounted at "/transactions" (NO /api prefix)');

const subRoutes = transactionLayer.handle.stack.filter(r => r.route);
const hasPost = subRoutes.some(r => r.route.path === '/' && r.route.methods?.post);
const hasGet = subRoutes.some(r => r.route.path === '/' && r.route.methods?.get);
const hasDelete = subRoutes.some(r => r.route.path === '/:id' && r.route.methods?.delete);

assert(hasPost, 'POST /transactions registered');
assert(hasGet, 'GET /transactions registered');
assert(hasDelete, 'DELETE /transactions/:id registered');
console.log('');

console.log('====================================================');
console.log(`  ALL ${passed}/${total} TESTS PASSED SUCCESSFULLY!`);
console.log('====================================================');
process.exit(0);
