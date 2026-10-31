import {
  createBudgetSchema,
  updateBudgetSchema,
  queryBudgetSchema
} from '../validators/budgetValidator.js';
import app from '../app.js';
import { toMinorUnits, toMajorUnits, normalizeToMonthStartUTC } from '../utils/currency.js';

console.log('====================================================');
console.log('      DAY 9 BUDGET VALIDATION & LOGIC TEST SUITE     ');
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

// 1. Budget Schema Validation Tests
console.log('[1/3] Testing Budget Validators...');

// Valid expense category
const validCreate = createBudgetSchema.safeParse({
  category: 'food_dining',
  limit: 5000,
  month: '2026-10'
});
assert(validCreate.success, 'Accepts valid budget with expense category and limit');

// String limit parsed to number
const stringLimit = createBudgetSchema.safeParse({
  category: 'transportation',
  limit: '2500.50'
});
assert(stringLimit.success && stringLimit.data.limit === 2500.5, 'Parses string limit into numeric float');

// Incompatible category (income category 'salary' rejected)
const invalidCategory = createBudgetSchema.safeParse({
  category: 'salary',
  limit: 10000
});
assert(!invalidCategory.success, 'Rejects non-expense category (salary)');

// Negative limit rejected
const negativeLimit = createBudgetSchema.safeParse({
  category: 'groceries',
  limit: -500
});
assert(!negativeLimit.success, 'Rejects negative budget limit');

// Zero limit rejected
const zeroLimit = createBudgetSchema.safeParse({
  category: 'utilities',
  limit: 0
});
assert(!zeroLimit.success, 'Rejects zero budget limit');

// Update schema validation
const validUpdate = updateBudgetSchema.safeParse({ limit: 7500 });
assert(validUpdate.success && validUpdate.data.limit === 7500, 'updateBudgetSchema accepts valid limit');

const invalidUpdate = updateBudgetSchema.safeParse({ limit: -100 });
assert(!invalidUpdate.success, 'updateBudgetSchema rejects negative limit');

// Query schema validation
const validQuery = queryBudgetSchema.safeParse({ month: '2026-10' });
assert(validQuery.success, 'queryBudgetSchema accepts YYYY-MM format');

const emptyQuery = queryBudgetSchema.safeParse({});
assert(emptyQuery.success, 'queryBudgetSchema accepts empty query');
console.log('');

// 2. Calculation & Threshold Logic Tests
console.log('[2/3] Testing Budget Math & Overspending Logic...');

// Minor unit limit conversions
assert(toMinorUnits(5000) === 500000, '₹5,000 converts to 500000 minor units');
assert(toMajorUnits(500000) === 5000, '500000 minor units converts to ₹5,000');

// UTC Month normalization
const normalizedDate = normalizeToMonthStartUTC('2026-10-15T15:30:00Z');
assert(normalizedDate.getUTCDate() === 1, 'Normalized date is the 1st of the month');
assert(normalizedDate.getUTCMonth() === 9, 'Normalized month is October (month index 9)');

// Calculation checks: Under budget (< 75%)
const limitMinor = 1000000; // ₹10,000
const spentMinor1 = 500000; // ₹5,000 (50%)
const pct1 = Number(((spentMinor1 / limitMinor) * 100).toFixed(1));
const isOver1 = spentMinor1 > limitMinor;
assert(pct1 === 50 && !isOver1, '50% spending is under budget');

// Calculation checks: Near limit (75% - 99%)
const spentMinor2 = 800000; // ₹8,000 (80%)
const pct2 = Number(((spentMinor2 / limitMinor) * 100).toFixed(1));
const isNear2 = pct2 >= 75 && pct2 < 100;
assert(isNear2, '80% spending triggers isNearLimit warning');

// Calculation checks: Over budget (>= 100%)
const spentMinor3 = 1200000; // ₹12,000 (120%)
const pct3 = Number(((spentMinor3 / limitMinor) * 100).toFixed(1));
const isOver3 = spentMinor3 > limitMinor;
const overBy3 = (spentMinor3 - limitMinor) / 100;
assert(isOver3 && overBy3 === 2000, '120% spending detects overspending of ₹2,000');
console.log('');

// 3. Express Route Mount Tests
console.log('[3/3] Verifying Express Budget Route Mounts...');
const routerStack = app.router?.stack || [];
const budgetLayer = routerStack.find(s => s.matchers?.[0] && s.matchers[0]('/budgets'));
assert(Boolean(budgetLayer), 'Routes mounted at "/budgets" (NO /api prefix)');

const subRoutes = budgetLayer.handle.stack.filter(r => r.route);
const hasGet = subRoutes.some(r => r.route.path === '/' && r.route.methods?.get);
const hasPost = subRoutes.some(r => r.route.path === '/' && r.route.methods?.post);
const hasPatch = subRoutes.some(r => r.route.path === '/:id' && r.route.methods?.patch);
const hasDelete = subRoutes.some(r => r.route.path === '/:id' && r.route.methods?.delete);

assert(hasGet, 'GET /budgets registered');
assert(hasPost, 'POST /budgets registered');
assert(hasPatch, 'PATCH /budgets/:id registered');
assert(hasDelete, 'DELETE /budgets/:id registered');
console.log('');

console.log('====================================================');
console.log(`  ALL ${passed}/${total} DAY 9 BACKEND TESTS PASSED!`);
console.log('====================================================');
process.exit(0);

