/**
 * Currency & minor unit handling utilities.
 * All monetary amounts in MongoDB are stored as minor units (e.g., 12550 for ₹125.50)
 * to avoid floating-point currency calculation errors.
 */

/**
 * Converts a major currency unit (decimal or string, e.g. 125.50) to minor units (integer, e.g. 12550).
 * @param {number|string} amount
 * @returns {number} Safe integer in minor units
 */
export const toMinorUnits = (amount) => {
  const num = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
  if (isNaN(num) || !isFinite(num)) {
    throw new TypeError(`Invalid amount: cannot convert '${amount}' to minor units`);
  }
  return Math.round(num * 100);
};

/**
 * Converts minor units (integer, e.g. 12550) to major currency units (decimal, e.g. 125.50).
 * @param {number} amountMinor
 * @returns {number} Decimal currency amount
 */
export const toMajorUnits = (amountMinor) => {
  if (typeof amountMinor !== 'number' || isNaN(amountMinor)) {
    return 0;
  }
  return Number((amountMinor / 100).toFixed(2));
};

/**
 * Formats a minor-unit integer as a formatted currency string (e.g. "₹125.50").
 * @param {number} amountMinor
 * @param {string} currencyCode Default 'INR'
 * @returns {string}
 */
export const formatCurrency = (amountMinor, currencyCode = 'INR') => {
  const major = toMajorUnits(amountMinor);
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(major);
  } catch {
    return `${currencyCode} ${major.toFixed(2)}`;
  }
};

/**
 * Normalizes any date to the first day of that month in UTC at 00:00:00.000Z.
 * Required for budget records so that unique compound index { userId: 1, category: 1, monthStart: 1 } works predictably.
 * @param {Date|string|number} date
 * @returns {Date}
 */
export const normalizeToMonthStartUTC = (date = new Date()) => {
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    throw new TypeError(`Invalid date provided for normalization: ${date}`);
  }
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
};
