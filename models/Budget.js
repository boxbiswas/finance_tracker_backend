import mongoose from 'mongoose';
import { EXPENSE_CATEGORIES, isValidExpenseCategory } from '../constants/categories.js';
import { toMinorUnits, toMajorUnits, normalizeToMonthStartUTC } from '../utils/currency.js';

const budgetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      index: true
    },
    category: {
      type: String,
      required: [true, 'Budget category is required'],
      enum: {
        values: EXPENSE_CATEGORIES,
        message: 'Budget category must be a valid expense category'
      },
      validate: {
        validator: isValidExpenseCategory,
        message: '{VALUE} is not a valid expense category for budgeting'
      }
    },
    monthStart: {
      type: Date,
      required: [true, 'monthStart date is required'],
      set: function (v) {
        // Automatically normalize to 1st day of month in UTC at 00:00:00.000Z
        return normalizeToMonthStartUTC(v);
      }
    },
    limitMinor: {
      type: Number,
      required: [true, 'limitMinor is required'],
      validate: {
        validator: function (v) {
          return Number.isSafeInteger(v) && v > 0;
        },
        message: 'limitMinor must be a positive, safe integer (e.g. 500000 for ₹5000.00)'
      }
    },
    currencyCode: {
      type: String,
      required: [true, 'currencyCode is required'],
      uppercase: true,
      trim: true,
      default: 'INR',
      minlength: 3,
      maxlength: 3
    }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    },
    toObject: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Virtual for human-readable major currency units (e.g. 5000.00)
budgetSchema.virtual('limit')
  .get(function () {
    return toMajorUnits(this.limitMinor);
  })
  .set(function (val) {
    this.limitMinor = toMinorUnits(val);
  });

// Unique compound index: prevents duplicate budgets for the same category and month per user
budgetSchema.index({ userId: 1, category: 1, monthStart: 1 }, { unique: true });

const Budget = mongoose.model('Budget', budgetSchema);

export default Budget;
