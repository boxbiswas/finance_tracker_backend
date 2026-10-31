import { exportQuerySchema } from '../validators/exportValidator.js';
import app from '../app.js';
import { Parser } from 'json2csv';
import PDFDocument from 'pdfkit';

console.log('====================================================');
console.log('       DAY 11 EXPORT APIS & LOGIC TEST SUITE        ');
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

// 1. Export Query Schema Validation Tests
console.log('[1/3] Testing exportQuerySchema...');

// Valid CSV format
const validCsv = exportQuerySchema.safeParse({ format: 'csv' });
assert(validCsv.success, 'Accepts format="csv"');
assert(validCsv.data.sort === 'date_desc', 'Defaults sort to "date_desc"');

// Valid PDF format with filters
const validPdf = exportQuerySchema.safeParse({
  format: 'pdf',
  from: '2026-01-01',
  to: '2026-10-31',
  type: 'expense',
  category: 'food_dining'
});
assert(validPdf.success, 'Accepts format="pdf" with full date and category filters');
assert(validPdf.data.type === 'expense', 'Captures type parameter');

// Invalid format rejected
const invalidFormat = exportQuerySchema.safeParse({ format: 'excel' });
assert(!invalidFormat.success, 'Rejects unsupported format (excel)');

// Invalid date range (from > to)
const invalidDateRange = exportQuerySchema.safeParse({
  format: 'csv',
  from: '2026-12-01',
  to: '2026-01-01'
});
assert(!invalidDateRange.success, 'Rejects query where "from" date is after "to" date');
console.log('');

// 2. CSV & PDF Data Formatting Tests
console.log('[2/3] Testing File Generation Formatting...');

// Test CSV Generation
const mockTransactions = [
  {
    'Transaction Date': '2026-10-15',
    'Type': 'EXPENSE',
    'Category': 'food dining',
    'Amount': '1250.50',
    'Currency': 'INR',
    'Notes': 'Grocery supplies'
  },
  {
    'Transaction Date': '2026-10-01',
    'Type': 'INCOME',
    'Category': 'salary',
    'Amount': '75000.00',
    'Currency': 'INR',
    'Notes': 'Monthly paycheck'
  }
];

const fields = ['Transaction Date', 'Type', 'Category', 'Amount', 'Currency', 'Notes'];
const parser = new Parser({ fields });
const csvOutput = parser.parse(mockTransactions);

assert(csvOutput.includes('"Transaction Date","Type","Category","Amount","Currency","Notes"'), 'CSV contains all required header columns');
assert(csvOutput.includes('"2026-10-15","EXPENSE","food dining","1250.50","INR","Grocery supplies"'), 'CSV contains accurate transaction row data');

// Test PDF Generation
const doc = new PDFDocument({ margin: 40, size: 'A4' });
const buffers = [];
doc.on('data', buffers.push.bind(buffers));

doc.fontSize(20).text('Clarivo — Transaction report');
doc.fontSize(10).text('Exported on: 2026-10-31');
doc.end();

await new Promise((resolve) => doc.on('end', resolve));
const pdfBuffer = Buffer.concat(buffers);
const pdfHeader = pdfBuffer.slice(0, 5).toString('ascii');
assert(pdfHeader === '%PDF-', 'PDF generator outputs valid binary with %PDF- header');
assert(pdfBuffer.length > 500, `Generated PDF buffer size is valid (${pdfBuffer.length} bytes)`);
console.log('');

// 3. Express Route Mount Tests
console.log('[3/3] Verifying Express Export Route Mounts (NO /api prefix)...');
const routerStack = app.router?.stack || [];
const exportLayer = routerStack.find(s => s.matchers?.[0] && s.matchers[0]('/exports'));
assert(Boolean(exportLayer), 'Export routes mounted at "/exports" (NO /api prefix)');

const subRoutes = exportLayer.handle.stack.filter(r => r.route);
const hasExportTransactions = subRoutes.some(r => r.route.path === '/transactions' && r.route.methods?.get);
assert(hasExportTransactions, 'GET /exports/transactions registered');
console.log('');

console.log('====================================================');
console.log(`  ALL ${passed}/${total} DAY 11 EXPORT TESTS PASSED!`);
console.log('====================================================');
process.exit(0);

