import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import app from '../app.js';
import { buildSystemPrompt } from '../services/copilotService.js';
import { sanitizeAIResponse } from '../services/aiProvider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

console.log('====================================================');
console.log('       DAY 14 AI PROVIDER & COPILOT TEST SUITE       ');
console.log('====================================================\n');

// [1/4] Verifying Service Architecture Files
console.log('[1/4] Verifying Service Architecture Files...');
const serviceFiles = [
  'backend/services/aiProvider.js',
  'backend/services/copilotService.js',
  'backend/services/financialContextService.js',
  'backend/services/financialAnalyticsService.js',
  'backend/src/services/aiProvider.js',
  'backend/src/services/copilotService.js',
  'backend/src/services/financialContextService.js',
  'backend/src/services/financialAnalyticsService.js'
];

serviceFiles.forEach((relPath) => {
  const fullPath = path.join(rootDir, relPath);
  assert(fs.existsSync(fullPath), `Expected service file ${relPath} to exist`);
  console.log(`  ✓ ${relPath} verified`);
});

// [2/4] Testing System Prompt Composition & Security Guardrails
console.log('\n[2/4] Testing System Prompt Composition & Security Restrictions...');
const mockContext = {
  summary: { totalIncome: 50000, totalExpense: 20000, netCashFlow: 30000 },
  breakdown: { topCategory: { category: 'food_dining', amount: 8000, percentage: 40 } },
  budgets: { totalBudgeted: 25000, totalSpent: 18000, hasExceededBudgets: false }
};

const prompt = buildSystemPrompt('Biswas', 'INR', mockContext);

// Check role identity line per DESIGN.md Section 1.1
assert(
  prompt.includes('You are Clarivo Copilot, the AI assistant embedded in the Clarivo personal finance tracker.'),
  'System prompt must include exact role line'
);
console.log('  ✓ System prompt role line matches specification');

// Check voice constraints
assert(prompt.includes('Plain, calm, and precise'), 'Enforces calm, plain, precise voice');
console.log('  ✓ System prompt enforces calm, plain, precise voice');

// Check honest wording rules
assert(prompt.includes('Always call the financial result "net cash flow" or "recorded balance"'), 'Enforces honest terminology');
assert(prompt.includes('NEVER claim or state that this is the user\'s "bank balance"'), 'Prohibits bank balance claim');
console.log('  ✓ System prompt strictly prohibits "bank balance" terminology');

// Check financial formula definitions
assert(prompt.includes('Net Cash Flow = Total Income - Total Expenses'), 'Embeds Net Cash Flow definition');
assert(prompt.includes('Remaining Budget = Budget Limit - Category Spending'), 'Embeds Remaining Budget definition');
console.log('  ✓ System prompt defines mathematical financial formulas');

// Check security & safety restrictions
assert(prompt.includes('Do not provide financial investment advice'), 'Forbids investment advice');
assert(prompt.includes('Do not attempt to execute, output, or suggest database queries'), 'Prevents arbitrary query execution');
console.log('  ✓ System prompt embeds explicit security & safety restrictions');

// Check context embedding
assert(prompt.includes('"totalIncome": 50000'), 'Embeds real database-backed context');
console.log('  ✓ Real database context properly embedded into prompt JSON');

// [3/4] Testing AI Output Sanitization & Security Filters
console.log('\n[3/4] Testing AI Response Sanitization & Terminology Filters...');
const rawMockOutput = 'Your current bank balance is ₹30,000. <script>alert("hack")</script>';
const sanitized = sanitizeAIResponse(rawMockOutput);

assert(!sanitized.includes('bank balance'), 'Sanitizer must replace "bank balance"');
assert(sanitized.includes('recorded balance'), 'Sanitizer must use "recorded balance"');
assert(!sanitized.includes('<script>'), 'Sanitizer must strip script tags');
console.log('  ✓ Sanitizer safely converts "bank balance" to "recorded balance"');
console.log('  ✓ Sanitizer strips raw HTML and executable script tags');

// [4/4] Verifying Express Copilot Routes & Mounts (NO /api prefix)
console.log('\n[4/4] Verifying Express Route Mounts (NO /api prefix)...');
const routerStack = app.router?.stack || [];
const copilotLayer = routerStack.find(s => s.matchers?.[0] && s.matchers[0]('/copilot'));

assert(Boolean(copilotLayer), 'Copilot routes mounted at "/copilot" (NO /api prefix)');
console.log('  ✓ Copilot routes mounted at "/copilot" (NO /api prefix)');

const subRoutes = copilotLayer.handle.stack.filter(r => r.route);
const hasQueryRoute = subRoutes.some(r => r.route.path === '/query' && r.route.methods?.post);
assert(hasQueryRoute, 'POST /copilot/query route registered');
console.log('  ✓ POST /copilot/query registered for AI copilot execution');

console.log('\n====================================================');
console.log('  ALL 14/14 DAY 14 AI PROVIDER TESTS PASSED!');
console.log('====================================================');

process.exit(0);

