import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/config.js';
import { User, Transaction, Budget } from '../models/index.js';
import { toMinorUnits, toMajorUnits, formatCurrency, normalizeToMonthStartUTC } from '../utils/currency.js';
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES, isValidCategory } from '../constants/categories.js';

const runVerification = async () => {
  console.log('====================================================');
  console.log('   DAY 2 DATABASE SCHEMA & 2-WAY MAPPING VERIFIER   ');
  console.log('====================================================\n');

  await connectDB();

  // Ensure indexes are built
  await User.syncIndexes();
  await Transaction.syncIndexes();
  await Budget.syncIndexes();
  console.log('✓ All Mongoose indexes synchronized with MongoDB\n');

  const testEmail = `test_verifier_${Date.now()}@example.com`;

  try {
    // ----------------------------------------------------
    // TEST 1: User Model Creation & Serialization
    // ----------------------------------------------------
    console.log('[TEST 1] Testing User Model creation & serialization...');
    const user = await User.create({
      name: 'Priya Sharma',
      email: testEmail,
      passwordHash: '$2b$10$e8wM53zVb8f5aF.testHashedPasswordString',
      currencyCode: 'INR'
    });

    const userObj = user.toJSON();
    if (userObj.passwordHash) {
      throw new Error('FAIL: passwordHash leaked in toJSON() output!');
    }
    if (!userObj.id || userObj._id) {
      throw new Error('FAIL: toJSON() did not transform _id to id or remove _id');
    }
    console.log(`✓ User created successfully with ID: ${user._id}`);
    console.log(`✓ passwordHash is protected and hidden: ${userObj.passwordHash === undefined}`);
    console.log(`✓ Default currencyCode: ${user.currencyCode}\n`);

    // ----------------------------------------------------
    // TEST 2: Unique Email Constraint
    // ----------------------------------------------------
    console.log('[TEST 2] Testing User unique email constraint...');
    let duplicateEmailBlocked = false;
    try {
      await User.create({
        name: 'Another User',
        email: testEmail,
        passwordHash: 'dummyHash'
      });
    } catch (err) {
      if (err.code === 11000) {
        duplicateEmailBlocked = true;
      }
    }
    if (!duplicateEmailBlocked) {
      throw new Error('FAIL: Duplicate email was not blocked by unique index!');
    }
    console.log('✓ Duplicate email successfully rejected by unique index\n');

    // ----------------------------------------------------
    // TEST 3: Transaction Model & Minor Unit Conversion
    // ----------------------------------------------------
    console.log('[TEST 3] Testing Transaction creation, minor units & virtuals...');
    // Create an income transaction (Salary ₹75,000.50 -> 7500050 minor)
    const incomeTxn = await Transaction.create({
      userId: user._id,
      type: 'income',
      amountMinor: toMinorUnits(75000.50), // 7500050
      category: 'salary',
      notes: 'October Monthly Salary',
      transactionDate: new Date('2026-10-05T10:00:00.000Z'),
      currencyCode: user.currencyCode
    });

    // Create an expense transaction (Groceries ₹4,520.75 -> 452075 minor)
    const expenseTxn = await Transaction.create({
      userId: user._id,
      type: 'expense',
      amountMinor: toMinorUnits(4520.75), // 452075
      category: 'food_dining',
      notes: 'Supermarket grocery run',
      transactionDate: new Date('2026-10-12T14:30:00.000Z'),
      currencyCode: user.currencyCode
    });

    // Check virtual getter (amount)
    if (expenseTxn.amount !== 4520.75) {
      throw new Error(`FAIL: Virtual amount getter returned ${expenseTxn.amount}, expected 4520.75`);
    }
    console.log(`✓ Income stored: ${incomeTxn.amountMinor} minor units (Virtual amount: ₹${incomeTxn.amount})`);
    console.log(`✓ Expense stored: ${expenseTxn.amountMinor} minor units (Virtual amount: ₹${expenseTxn.amount})`);
    console.log(`✓ Formatted: ${formatCurrency(expenseTxn.amountMinor, 'INR')}\n`);

    // ----------------------------------------------------
    // TEST 4: Category/Type Compatibility Validation
    // ----------------------------------------------------
    console.log('[TEST 4] Testing Category/Type compatibility validation...');
    let incompatibleCategoryBlocked = false;
    try {
      // Trying to assign 'salary' (income) to an 'expense'
      await Transaction.create({
        userId: user._id,
        type: 'expense',
        amountMinor: 10000,
        category: 'salary',
        currencyCode: 'INR'
      });
    } catch (err) {
      incompatibleCategoryBlocked = true;
    }
    if (!incompatibleCategoryBlocked) {
      throw new Error('FAIL: Incompatible category (salary on expense) was NOT rejected!');
    }
    console.log('✓ Incompatible category (salary on expense) successfully rejected by validation\n');

    // ----------------------------------------------------
    // TEST 5: Budget Model, UTC Normalization & Unique Compound Index
    // ----------------------------------------------------
    console.log('[TEST 5] Testing Budget model, UTC month normalization & compound index...');
    // Create budget for food_dining for October 2026 (Limit: ₹15,000 -> 1500000 minor)
    const budget = await Budget.create({
      userId: user._id,
      category: 'food_dining',
      monthStart: new Date('2026-10-18T18:45:00.000Z'), // Passed mid-month date
      limitMinor: toMinorUnits(15000), // 1500000
      currencyCode: user.currencyCode
    });

    // Verify date normalized to 1st of October at 00:00:00.000Z
    const expectedUTC = new Date(Date.UTC(2026, 9, 1, 0, 0, 0, 0)).toISOString();
    if (budget.monthStart.toISOString() !== expectedUTC) {
      throw new Error(`FAIL: monthStart not normalized to 1st of month. Got ${budget.monthStart.toISOString()}, expected ${expectedUTC}`);
    }
    console.log(`✓ monthStart auto-normalized to UTC: ${budget.monthStart.toISOString()}`);
    console.log(`✓ Budget limit stored: ${budget.limitMinor} minor units (Virtual limit: ₹${budget.limit})`);

    // Test unique compound index: attempt duplicate budget for same user, category, and month
    let duplicateBudgetBlocked = false;
    try {
      await Budget.create({
        userId: user._id,
        category: 'food_dining',
        monthStart: new Date('2026-10-01T00:00:00.000Z'),
        limitMinor: toMinorUnits(20000),
        currencyCode: user.currencyCode
      });
    } catch (err) {
      if (err.code === 11000) {
        duplicateBudgetBlocked = true;
      }
    }
    if (!duplicateBudgetBlocked) {
      throw new Error('FAIL: Duplicate budget for same category and month was NOT blocked by compound index!');
    }
    console.log('✓ Duplicate budget { userId, category, monthStart } successfully rejected by unique compound index\n');

    // ----------------------------------------------------
    // TEST 6: 2-Way Mapping & Population Verification
    // ----------------------------------------------------
    console.log('[TEST 6] Testing 2-Way Mapping and Population...');
    
    // 1. Transaction -> User (Child to Parent ref)
    const populatedTxn = await Transaction.findById(expenseTxn._id).populate('userId', 'name email currencyCode');
    if (!populatedTxn.userId || populatedTxn.userId.email !== testEmail) {
      throw new Error('FAIL: Transaction -> User population failed');
    }
    console.log(`✓ Transaction -> User populated: Txn "${populatedTxn.category}" belongs to "${populatedTxn.userId.name}" (${populatedTxn.userId.email})`);

    // 2. Budget -> User (Child to Parent ref)
    const populatedBudget = await Budget.findById(budget._id).populate('userId', 'name email');
    if (!populatedBudget.userId || populatedBudget.userId.email !== testEmail) {
      throw new Error('FAIL: Budget -> User population failed');
    }
    console.log(`✓ Budget -> User populated: Budget "${populatedBudget.category}" belongs to "${populatedBudget.userId.name}"`);

    // 3. User -> Transactions (Parent to Children virtual populate)
    const populatedUserWithTxns = await User.findById(user._id).populate('transactions');
    if (!populatedUserWithTxns.transactions || populatedUserWithTxns.transactions.length !== 2) {
      throw new Error(`FAIL: User -> Transactions virtual populate failed. Count: ${populatedUserWithTxns.transactions?.length}`);
    }
    console.log(`✓ User -> Transactions virtual populated: Found ${populatedUserWithTxns.transactions.length} transactions for user`);

    // 4. User -> Budgets (Parent to Children virtual populate)
    const populatedUserWithBudgets = await User.findById(user._id).populate('budgets');
    if (!populatedUserWithBudgets.budgets || populatedUserWithBudgets.budgets.length !== 1) {
      throw new Error(`FAIL: User -> Budgets virtual populate failed. Count: ${populatedUserWithBudgets.budgets?.length}`);
    }
    console.log(`✓ User -> Budgets virtual populated: Found ${populatedUserWithBudgets.budgets.length} budget(s) for user\n`);

    // ----------------------------------------------------
    // TEST 7: Aggregation Pipelines (Totals, Trends, Budget Status)
    // ----------------------------------------------------
    console.log('[TEST 7] Testing MongoDB Aggregation Pipelines (Income, Expense, Net Cash Flow, Budget Utilization)...');
    
    // Aggregation summary pipeline
    const [summary] = await Transaction.aggregate([
      { $match: { userId: user._id } },
      {
        $group: {
          _id: null,
          totalIncomeMinor: {
            $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amountMinor', 0] }
          },
          totalExpenseMinor: {
            $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amountMinor', 0] }
          },
          transactionCount: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          totalIncomeMinor: 1,
          totalExpenseMinor: 1,
          netCashFlowMinor: { $subtract: ['$totalIncomeMinor', '$totalExpenseMinor'] },
          transactionCount: 1
        }
      }
    ]);

    const totalIncome = toMajorUnits(summary.totalIncomeMinor);
    const totalExpense = toMajorUnits(summary.totalExpenseMinor);
    const netCashFlow = toMajorUnits(summary.netCashFlowMinor);

    console.log(`✓ Aggregation Summary Results:`);
    console.log(`  - Total Income: ₹${totalIncome.toLocaleString('en-IN')}`);
    console.log(`  - Total Expense: ₹${totalExpense.toLocaleString('en-IN')}`);
    console.log(`  - Net Cash Flow: ₹${netCashFlow.toLocaleString('en-IN')}`);
    console.log(`  - Transaction Count: ${summary.transactionCount}`);

    // Budget utilization calculation
    const budgetLimit = toMajorUnits(budget.limitMinor);
    const categorySpent = totalExpense; // since food_dining is the only expense
    const remainingBudget = budgetLimit - categorySpent;
    const utilizationPercent = ((categorySpent / budgetLimit) * 100).toFixed(1);

    console.log(`✓ Budget Progress for "${budget.category}":`);
    console.log(`  - Limit: ₹${budgetLimit}`);
    console.log(`  - Spent: ₹${categorySpent}`);
    console.log(`  - Remaining: ₹${remainingBudget}`);
    console.log(`  - Utilization: ${utilizationPercent}%\n`);

    // ----------------------------------------------------
    // CLEANUP TEST DATA
    // ----------------------------------------------------
    console.log('Cleaning up test documents...');
    await Transaction.deleteMany({ userId: user._id });
    await Budget.deleteMany({ userId: user._id });
    await User.findByIdAndDelete(user._id);
    console.log('✓ Test data cleaned up successfully.\n');

    console.log('====================================================');
    console.log('  ALL DAY 2 TESTS PASSED! DATABASE SCHEMA IS ROCK-SOLID');
    console.log('====================================================');
  } catch (err) {
    console.error('\n❌ VERIFICATION FAILED:', err);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
    process.exit(0);
  }
};

runVerification();
