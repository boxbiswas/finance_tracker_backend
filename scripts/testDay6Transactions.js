import http from 'http';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';

const runTests = async () => {
  console.log('====================================================');
  console.log('       DAY 6 TRANSACTION APIS TEST SUITE            ');
  console.log('====================================================\n');

  // Launch a temporary HTTP server
  const testServer = http.createServer(app);
  await new Promise(resolve => testServer.listen(0, resolve));
  const port = testServer.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let passed = 0;
  let total = 0;

  const assert = (condition, message) => {
    total++;
    if (!condition) {
      console.error(`❌ FAIL: ${message}`);
      throw new Error(message);
    }
    passed++;
    console.log(`  ✓ ${message}`);
  };

  let user1, user2;
  let token1, token2;
  let txnIncomeId, txnExpenseId;

  try {
    // -----------------------------------------------------------------
    // PREPARATION: Create two isolated test users and JWT tokens
    // -----------------------------------------------------------------
    // Wait for MongoDB connection to be open before executing tests
    console.log('[SETUP] Connecting to database...');
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connection.asPromise();
    }
    console.log('✓ Database connected');

    console.log('[SETUP] Creating test users...');
    const timestamp = Date.now();
    user1 = await User.create({
      name: 'Rohan Mehta',
      email: `rohan_${timestamp}@example.com`,
      passwordHash: 'dummyHash123',
      currencyCode: 'INR'
    });
    user2 = await User.create({
      name: 'Ananya Sen',
      email: `ananya_${timestamp}@example.com`,
      passwordHash: 'dummyHash456',
      currencyCode: 'INR'
    });

    const jwtSecret = process.env.JWT_SECRET || 'secret_key_finance_tracker';
    token1 = jwt.sign({ id: user1._id.toString(), email: user1.email }, jwtSecret, { expiresIn: '1h' });
    token2 = jwt.sign({ id: user2._id.toString(), email: user2.email }, jwtSecret, { expiresIn: '1h' });
    console.log('✓ Test users and tokens initialized\n');

    // -----------------------------------------------------------------
    // TEST 1: Authentication Requirement
    // -----------------------------------------------------------------
    console.log('[1/6] Testing Authentication Enforcement...');
    const unauthGetRes = await fetch(`${baseUrl}/transactions`);
    assert(unauthGetRes.status === 401, 'GET /transactions without token returns 401 Unauthorized');

    const unauthPostRes = await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'income', amount: 1000, category: 'salary' })
    });
    assert(unauthPostRes.status === 401, 'POST /transactions without token returns 401 Unauthorized');
    console.log('');

    // -----------------------------------------------------------------
    // TEST 2: Validation of Transaction Type and Category Compatibility
    // -----------------------------------------------------------------
    console.log('[2/6] Testing Input Validation & Category Compatibility...');
    
    // Attempt incompatible category: salary (income) assigned to expense
    const incompatibleRes = await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token1}`
      },
      body: JSON.stringify({
        type: 'expense',
        amount: 2500,
        category: 'salary' // Incompatible!
      })
    });
    assert(incompatibleRes.status === 400, 'POST /transactions with incompatible category returns 400 Bad Request');
    const incompData = await incompatibleRes.json();
    assert(incompData.errors.some(e => e.field === 'category'), 'Validation error specifically flags category field');

    // Attempt negative amount
    const negativeRes = await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token1}`
      },
      body: JSON.stringify({
        type: 'income',
        amount: -500,
        category: 'salary'
      })
    });
    assert(negativeRes.status === 400, 'POST /transactions with negative amount returns 400 Bad Request');
    console.log('');

    // -----------------------------------------------------------------
    // TEST 3: Successful Transaction Creation (Income & Expense)
    // -----------------------------------------------------------------
    console.log('[3/6] Testing Successful Transaction Creation (POST /transactions)...');
    
    // Create Income: Salary ₹60,000.50
    const incomeRes = await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token1}`
      },
      body: JSON.stringify({
        type: 'income',
        amount: 60000.50,
        category: 'salary',
        notes: 'Monthly company salary',
        transactionDate: '2026-10-05T10:00:00.000Z'
      })
    });
    assert(incomeRes.status === 201, 'POST /transactions creates income and returns 201 Created');
    const incomeData = await incomeRes.json();
    txnIncomeId = incomeData.transaction.id;
    assert(incomeData.transaction.amountMinor === 6000050, 'amountMinor correctly stored as 6000050');
    assert(incomeData.transaction.amount === 60000.5, 'Virtual amount correctly returns 60000.5');

    // Create Expense: Groceries ₹3,450.25
    const expenseRes = await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token1}`
      },
      body: JSON.stringify({
        type: 'expense',
        amount: 3450.25,
        category: 'food_dining',
        notes: 'Supermarket supplies',
        transactionDate: '2026-10-15T15:30:00.000Z'
      })
    });
    assert(expenseRes.status === 201, 'POST /transactions creates expense and returns 201 Created');
    const expenseData = await expenseRes.json();
    txnExpenseId = expenseData.transaction.id;
    assert(expenseData.transaction.amountMinor === 345025, 'amountMinor correctly stored as 345025');
    assert(expenseData.transaction.amount === 3450.25, 'Virtual amount correctly returns 3450.25');
    console.log('');

    // -----------------------------------------------------------------
    // TEST 4: Query Filters, Sorting, and Pagination (GET /transactions)
    // -----------------------------------------------------------------
    console.log('[4/6] Testing Query Filters (from, to, type, category, sort, page, limit)...');
    
    // List all transactions for User 1
    const listAllRes = await fetch(`${baseUrl}/transactions`, {
      headers: { 'Authorization': `Bearer ${token1}` }
    });
    assert(listAllRes.status === 200, 'GET /transactions returns 200 OK');
    const listAllData = await listAllRes.json();
    assert(listAllData.transactions.length === 2, 'Returns 2 transactions for User 1');
    assert(listAllData.pagination.total === 2, 'Pagination total is 2');

    // Filter by type: income only
    const typeIncomeRes = await fetch(`${baseUrl}/transactions?type=income`, {
      headers: { 'Authorization': `Bearer ${token1}` }
    });
    const typeIncomeData = await typeIncomeRes.json();
    assert(typeIncomeData.transactions.length === 1, 'Filter type=income returns exactly 1 record');
    assert(typeIncomeData.transactions[0].category === 'salary', 'Returned record is salary');

    // Filter by category: food_dining only
    const catRes = await fetch(`${baseUrl}/transactions?category=food_dining`, {
      headers: { 'Authorization': `Bearer ${token1}` }
    });
    const catData = await catRes.json();
    assert(catData.transactions.length === 1, 'Filter category=food_dining returns exactly 1 record');
    assert(catData.transactions[0].type === 'expense', 'Returned record is expense');

    // Filter by date range: from and to
    const dateRangeRes = await fetch(`${baseUrl}/transactions?from=2026-10-01&to=2026-10-10`, {
      headers: { 'Authorization': `Bearer ${token1}` }
    });
    const dateRangeData = await dateRangeRes.json();
    assert(dateRangeData.transactions.length === 1, 'Date range filter returns 1 matching transaction');

    // Invalid date range (from > to)
    const invalidDateRes = await fetch(`${baseUrl}/transactions?from=2026-10-20&to=2026-10-01`, {
      headers: { 'Authorization': `Bearer ${token1}` }
    });
    assert(invalidDateRes.status === 400, 'Query with from > to returns 400 Bad Request');

    // Sort by amount descending
    const sortRes = await fetch(`${baseUrl}/transactions?sort=amount_desc`, {
      headers: { 'Authorization': `Bearer ${token1}` }
    });
    const sortData = await sortRes.json();
    assert(sortData.transactions[0].amountMinor >= sortData.transactions[1].amountMinor, 'sort=amount_desc returns highest amount first');
    console.log('');

    // -----------------------------------------------------------------
    // TEST 5: Strict User Isolation (Ownership Protection)
    // -----------------------------------------------------------------
    console.log('[5/6] Testing User Isolation & Data Ownership...');
    
    // User 2 queries transactions
    const user2GetRes = await fetch(`${baseUrl}/transactions`, {
      headers: { 'Authorization': `Bearer ${token2}` }
    });
    const user2GetData = await user2GetRes.json();
    assert(user2GetData.transactions.length === 0, 'User 2 sees 0 transactions (cannot access User 1 data)');

    // User 2 attempts to delete User 1's transaction
    const unauthorizedDelRes = await fetch(`${baseUrl}/transactions/${txnIncomeId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token2}` }
    });
    assert(unauthorizedDelRes.status === 404, 'User 2 cannot delete User 1 transaction (returns 404 unauthorized)');
    console.log('');

    // -----------------------------------------------------------------
    // TEST 6: Transaction Deletion (DELETE /transactions/:id)
    // -----------------------------------------------------------------
    console.log('[6/6] Testing Authorized Deletion...');
    
    // User 1 deletes their expense transaction
    const deleteRes = await fetch(`${baseUrl}/transactions/${txnExpenseId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token1}` }
    });
    assert(deleteRes.status === 200, 'DELETE /transactions/:id returns 200 OK');
    const deleteData = await deleteRes.json();
    assert(deleteData.message.includes('deleted successfully'), 'Returns success confirmation message');

    // Verify record is gone
    const verifyListRes = await fetch(`${baseUrl}/transactions`, {
      headers: { 'Authorization': `Bearer ${token1}` }
    });
    const verifyListData = await verifyListRes.json();
    assert(verifyListData.pagination.total === 1, 'Transaction count reduced to 1 after deletion');
    assert(verifyListData.transactions[0].id === txnIncomeId, 'Remaining transaction is the income record');
    console.log('');

    console.log('====================================================');
    console.log(`  ALL ${passed}/${total} DAY 6 TRANSACTION TESTS PASSED!`);
    console.log('  Create, Read, Filter, Sort, Pagination & Delete OK');
    console.log('====================================================');
  } catch (err) {
    console.error('TEST SUITE FAILED:', err);
    process.exit(1);
  } finally {
    // Cleanup test data
    if (user1) {
      await Transaction.deleteMany({ userId: user1._id });
      await User.findByIdAndDelete(user1._id);
    }
    if (user2) {
      await Transaction.deleteMany({ userId: user2._id });
      await User.findByIdAndDelete(user2._id);
    }
    testServer.close();
    process.exit(0);
  }
};

runTests();
