/**
 * Predefined income and expense categories as specified in the project plan.
 * Used for strict schema validation and category/type compatibility checks.
 */

export const INCOME_CATEGORIES = [
  'salary',
  'freelance',
  'business',
  'investment',
  'gift',
  'refund',
  'other_income'
];

export const EXPENSE_CATEGORIES = [
  'food_dining',
  'housing',
  'transportation',
  'utilities',
  'healthcare',
  'shopping',
  'entertainment',
  'education',
  'travel',
  'subscriptions',
  'personal_care',
  'debt_payment',
  'other_expense'
];

export const TRANSACTION_TYPES = ['income', 'expense'];

export const ALL_CATEGORIES = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES];

/**
 * Validates whether a category is valid for a given transaction type.
 * @param {'income'|'expense'} type
 * @param {string} category
 * @returns {boolean}
 */
export const isValidCategory = (type, category) => {
  if (type === 'income') {
    return INCOME_CATEGORIES.includes(category);
  }
  if (type === 'expense') {
    return EXPENSE_CATEGORIES.includes(category);
  }
  return false;
};

/**
 * Validates whether a category is a valid expense category (e.g. for budgets).
 * @param {string} category
 * @returns {boolean}
 */
export const isValidExpenseCategory = (category) => {
  return EXPENSE_CATEGORIES.includes(category);
};
