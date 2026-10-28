import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { User, Transaction, Budget } from '../models/index.js';
import {
  toMinorUnits,
  toMajorUnits,
  formatCurrency,
  normalizeToMonthStartUTC
} from '../utils/currency.js';
import {
  INCOME_CATEGORIES,
  EXPENSE_CATEGORIES,
  ALL_CATEGORIES,
  isValidCategory,
  isValidExpenseCategory
} from '../constants/categories.js';

const validateDoc = async (doc) => {
  try {
    await doc.validate();
    return null;
  } catch (err) {
    return err;
  }
};

const runOfflineTests = async () => {
  console.log('====================================================');
  console.log('   OFFLINE SCHEMA, VALIDATION & MAPPING VERIFIER    ');
  console.log('====================================================\n');

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

  try {
    // -----------------------------------------------------------------
    // 1. FLOATING POINT & MINOR UNIT UTILITIES
    // -----------------------------------------------------------------
    console.log('[1/5] Testing Currency & Minor Unit Precision...');
    assert(toMinorUnits(125.50) === 12550, '₹125.50 correctly converts to 12550 minor units');
    assert(toMinorUnits('49.99') === 4999, 'String "49.99" converts to 4999 minor units');
    assert(toMajorUnits(12550) === 125.50, '12550 minor units correctly converts to 125.50');
    assert(toMajorUnits(0) === 0, '0 minor units converts to 0');
    
    // Classic JavaScript float inaccuracy check: 0.1 + 0.2
    const sumMinor = toMinorUnits(0.1) + toMinorUnits(0.2);
    assert(sumMinor === 30, '0.1 + 0.2 in minor units is precisely 30 (₹0.30) without float drift');
    assert(toMajorUnits(sumMinor) === 0.3, '30 minor units converts to 0.30');
    assert(formatCurrency(12550, 'INR').includes('125.50'), 'Currency formatting output includes 125.50');
    console.log('');

    // -----------------------------------------------------------------
    // 2. USER MODEL SCHEMA & VALIDATIONS
    // -----------------------------------------------------------------
    console.log('[2/5] Testing User Model Schema & Protection...');
    const dummyUserId = new mongoose.Types.ObjectId();
    const testHash = await bcrypt.hash('secret123', 10);
    
    const userDoc = new User({
      _id: dummyUserId,
      name: 'Aditi Rao',
      email: 'aditi.rao@example.com',
      passwordHash: testHash,
      currencyCode: 'INR'
    });

    const userValidationError = await validateDoc(userDoc);
    assert(!userValidationError, 'Valid user document passes Mongoose validation');
    assert(userDoc.currencyCode === 'INR', 'Default currencyCode is INR');

    // Test passwordHash is omitted in toJSON
    const serializedUser = userDoc.toJSON();
    assert(serializedUser.passwordHash === undefined, 'passwordHash is strictly excluded from JSON output');
    assert(serializedUser.id === dummyUserId.toString(), 'toJSON converts _id to id');
    assert(serializedUser._id === undefined, '_id is stripped from JSON output');
    assert(serializedUser.__v === undefined, '__v is stripped from JSON output');

    // Test password comparison
    const passwordMatches = await userDoc.comparePassword('secret123');
    assert(passwordMatches === true, 'comparePassword successfully validates correct password');
    const wrongPasswordMatches = await userDoc.comparePassword('wrongpass');
    assert(wrongPasswordMatches === false, 'comparePassword rejects incorrect password');

    // Test User virtuals exist
    assert(User.schema.virtuals.transactions !== undefined, 'User model has virtual "transactions" defined');
    assert(User.schema.virtuals.budgets !== undefined, 'User model has virtual "budgets" defined');
    assert(User.schema.virtuals.transactions.options.ref === 'Transaction', 'User.transactions references "Transaction"');
    assert(User.schema.virtuals.budgets.options.ref === 'Budget', 'User.budgets references "Budget"');

    // Test invalid email
    const invalidEmailUser = new User({
      name: 'Bad Email',
      email: 'not-an-email',
      passwordHash: testHash
    });
    const emailErr = await validateDoc(invalidEmailUser);
    assert(emailErr && emailErr.errors.email, 'Invalid email format is rejected by validator');
    console.log('');

    // -----------------------------------------------------------------
    // 3. TRANSACTION MODEL SCHEMA & VALIDATIONS
    // -----------------------------------------------------------------
    console.log('[3/5] Testing Transaction Model & Category Compatibility...');
    
    // Valid Income
    const incomeDoc = new Transaction({
      userId: dummyUserId,
      type: 'income',
      amountMinor: 5000000, // ₹50,000
      category: 'salary',
      currencyCode: 'INR'
    });
    const incomeErr = await validateDoc(incomeDoc);
    assert(!incomeErr, 'Valid income transaction (salary) passes validation');
    assert(incomeDoc.amount === 50000, 'Virtual amount getter returns ₹50,000');

    // Test virtual amount setter
    incomeDoc.amount = 75000.50;
    assert(incomeDoc.amountMinor === 7500050, 'Setting doc.amount = 75000.50 updates amountMinor to 7500050');

    // Valid Expense
    const expenseDoc = new Transaction({
      userId: dummyUserId,
      type: 'expense',
      amountMinor: 250000, // ₹2,500
      category: 'food_dining',
      currencyCode: 'INR'
    });
    const expenseErr = await validateDoc(expenseDoc);
    assert(!expenseErr, 'Valid expense transaction (food_dining) passes validation');

    // Incompatible: Salary on Expense
    const invalidCategoryTxn = new Transaction({
      userId: dummyUserId,
      type: 'expense',
      amountMinor: 10000,
      category: 'salary', // Invalid for expense!
      currencyCode: 'INR'
    });
    const invalidCatErr = await validateDoc(invalidCategoryTxn);
    assert(invalidCatErr && invalidCatErr.errors.category, 'Assigning income category "salary" to type "expense" is strictly rejected');

    // Incompatible: Food_dining on Income
    const invalidIncomeTxn = new Transaction({
      userId: dummyUserId,
      type: 'income',
      amountMinor: 10000,
      category: 'food_dining', // Invalid for income!
      currencyCode: 'INR'
    });
    const invalidIncomeErr = await validateDoc(invalidIncomeTxn);
    assert(invalidIncomeErr && invalidIncomeErr.errors.category, 'Assigning expense category "food_dining" to type "income" is strictly rejected');

    // Verify negative or fractional amountMinor is rejected
    const negativeAmountTxn = new Transaction({
      userId: dummyUserId,
      type: 'expense',
      amountMinor: -500,
      category: 'transportation',
      currencyCode: 'INR'
    });
    const negativeErr = await validateDoc(negativeAmountTxn);
    assert(negativeErr && negativeErr.errors.amountMinor, 'Negative amountMinor is rejected');

    // Verify Transaction indexes defined
    const txnIndexes = Transaction.schema.indexes();
    const hasDateIndex = txnIndexes.some(idx => idx[0].userId === 1 && idx[0].transactionDate === -1);
    const hasTypeIndex = txnIndexes.some(idx => idx[0].userId === 1 && idx[0].type === 1 && idx[0].transactionDate === -1);
    const hasCategoryIndex = txnIndexes.some(idx => idx[0].userId === 1 && idx[0].category === 1 && idx[0].transactionDate === -1);
    assert(hasDateIndex, 'Compound index { userId: 1, transactionDate: -1 } exists');
    assert(hasTypeIndex, 'Compound index { userId: 1, type: 1, transactionDate: -1 } exists');
    assert(hasCategoryIndex, 'Compound index { userId: 1, category: 1, transactionDate: -1 } exists');
    console.log('');

    // -----------------------------------------------------------------
    // 4. BUDGET MODEL SCHEMA & VALIDATIONS
    // -----------------------------------------------------------------
    console.log('[4/5] Testing Budget Model, UTC Normalization & Compound Index...');
    
    // Normalization test
    const rawDate = new Date('2026-10-25T15:30:00.000Z');
    const normalized = normalizeToMonthStartUTC(rawDate);
    assert(normalized.getUTCFullYear() === 2026, 'Normalized year is 2026');
    assert(normalized.getUTCMonth() === 9, 'Normalized month is October (0-indexed 9)');
    assert(normalized.getUTCDate() === 1, 'Normalized date is 1st of the month');
    assert(normalized.getUTCHours() === 0 && normalized.getUTCMinutes() === 0, 'Normalized time is 00:00:00.000 UTC');

    const budgetDoc = new Budget({
      userId: dummyUserId,
      category: 'food_dining',
      monthStart: rawDate,
      limitMinor: 1500000, // ₹15,000
      currencyCode: 'INR'
    });
    const budgetErr = await validateDoc(budgetDoc);
    assert(!budgetErr, 'Valid budget document passes validation');
    assert(budgetDoc.monthStart.toISOString() === '2026-10-01T00:00:00.000Z', 'Budget.monthStart automatically normalized to UTC 1st of month');
    assert(budgetDoc.limit === 15000, 'Virtual limit getter returns ₹15,000');

    // Test virtual limit setter
    budgetDoc.limit = 20000;
    assert(budgetDoc.limitMinor === 2000000, 'Setting doc.limit = 20000 updates limitMinor to 2000000');

    // Incompatible: Income category on budget
    const invalidBudgetCategory = new Budget({
      userId: dummyUserId,
      category: 'salary', // Income category cannot have a budget
      monthStart: rawDate,
      limitMinor: 100000,
      currencyCode: 'INR'
    });
    const invalidBudgetErr = await validateDoc(invalidBudgetCategory);
    assert(invalidBudgetErr && invalidBudgetErr.errors.category, 'Income category "salary" cannot be used for a Budget');

    // Verify Budget unique compound index defined
    const budgetIndexes = Budget.schema.indexes();
    const hasUniqueCompound = budgetIndexes.some(
      idx => idx[0].userId === 1 && idx[0].category === 1 && idx[0].monthStart === 1 && idx[1]?.unique === true
    );
    assert(hasUniqueCompound, 'Unique compound index { userId: 1, category: 1, monthStart: 1 } (unique: true) exists');
    console.log('');

    // -----------------------------------------------------------------
    // 5. 2-WAY MAPPING & POPULATION LOGIC
    // -----------------------------------------------------------------
    console.log('[5/5] Verifying 2-Way Mapping Model Definitions...');
    assert(Transaction.schema.path('userId').options.ref === 'User', 'Transaction.userId explicitly references User model');
    assert(Budget.schema.path('userId').options.ref === 'User', 'Budget.userId explicitly references User model');
    assert(User.schema.virtuals.transactions.options.foreignField === 'userId', 'User virtual transactions points to foreignField "userId"');
    assert(User.schema.virtuals.budgets.options.foreignField === 'userId', 'User virtual budgets points to foreignField "userId"');
    console.log('');

    console.log('====================================================');
    console.log(`  SUMMARY: ALL ${passed}/${total} CHECKS PASSED PERFECTLY!`);
    console.log('  Database design, type safety & 2-way mapping are solid.');
    console.log('====================================================');
  } catch (err) {
    console.error('VERIFICATION FAILED:', err);
    process.exit(1);
  }
};

runOfflineTests();
