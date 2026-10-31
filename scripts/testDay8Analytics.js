import { queryAnalyticsSchema } from '../validators/analyticsValidator.js';
import app from '../app.js';

console.log('====================================================');
console.log('   DAY 8 ANALYTICS VALIDATION & ROUTE TEST SUITE     ');
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

// 1. Analytics Query Schema Validation Tests
console.log('[1/2] Testing queryAnalyticsSchema...');

// Empty query accepts defaults
const testEmpty = queryAnalyticsSchema.safeParse({});
assert(testEmpty.success, 'Accepts empty query parameters');
assert(testEmpty.data?.months === 6, 'Defaults months parameter to 6');

// Valid query with date range and type
const testValid = queryAnalyticsSchema.safeParse({
  from: '2026-05-01',
  to: '2026-10-31',
  type: 'expense',
  months: '12'
});
assert(testValid.success, 'Accepts valid date range, type, and months');
assert(testValid.data?.months === 12, 'Converts string "12" to integer 12');
assert(testValid.data?.type === 'expense', 'Captures type parameter');

// Months bounding: capped between 1 and 24
const testCappedMonths = queryAnalyticsSchema.safeParse({ months: 50 });
assert(testCappedMonths.success && testCappedMonths.data?.months === 24, 'Caps months parameter at 24');

const testMinMonths = queryAnalyticsSchema.safeParse({ months: -5 });
assert(testMinMonths.success && testMinMonths.data?.months === 1, 'Enforces minimum months parameter of 1');

// Invalid date range (from > to)
const testInvalidRange = queryAnalyticsSchema.safeParse({
  from: '2026-11-01',
  to: '2026-10-01'
});
assert(!testInvalidRange.success, 'Rejects query where "from" date is after "to" date');
console.log('');

// 2. Express Route Registration Tests
console.log('[2/2] Verifying Express Analytics Route Mounts...');
const routerStack = app.router?.stack || [];
const analyticsLayer = routerStack.find(s => s.matchers?.[0] && s.matchers[0]('/analytics'));
assert(Boolean(analyticsLayer), 'Routes mounted at "/analytics" (NO /api prefix)');

const subRoutes = analyticsLayer.handle.stack.filter(r => r.route);
const hasSummary = subRoutes.some(r => r.route.path === '/summary' && r.route.methods?.get);
const hasCategories = subRoutes.some(r => r.route.path === '/category-breakdown' && r.route.methods?.get);
const hasTrends = subRoutes.some(r => r.route.path === '/monthly-trends' && r.route.methods?.get);

assert(hasSummary, 'GET /analytics/summary registered');
assert(hasCategories, 'GET /analytics/category-breakdown registered');
assert(hasTrends, 'GET /analytics/monthly-trends registered');
console.log('');

console.log('====================================================');
console.log(`  ALL ${passed}/${total} DAY 8 BACKEND TESTS PASSED!`);
console.log('====================================================');
process.exit(0);
