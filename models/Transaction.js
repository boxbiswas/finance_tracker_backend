import mongoose from 'mongoose';
import {
  TRANSACTION_TYPES,
  ALL_CATEGORIES,
  isValidCategory
} from '../constants/categories.js';
import { toMinorUnits, toMajorUnits } from '../utils/currency.js';

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      index: true
    },
    type: {
      type: String,
      required: [true, 'Transaction type is required'],
      enum: {
        values: TRANSACTION_TYPES,
        message: 'Type must be either "income" or "expense"'
      }
    },
    amountMinor: {
      type: Number,
      required: [true, 'amountMinor is required'],
      validate: {
        validator: function (v) {
          return Number.isSafeInteger(v) && v > 0;
        },
        message: 'amountMinor must be a positive, safe integer (e.g. 12550 for ₹125.50)'
      }
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: {
        values: ALL_CATEGORIES,
        message: 'Invalid category'
      },
      validate: {
        validator: function (val) {
          // Validate category compatibility with transaction type
          return isValidCategory(this.type, val);
        },
        message: props => `Category '${props.value}' is not valid for the selected transaction type`
      }
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, 'Notes cannot exceed 500 characters'],
      default: ''
    },
    transactionDate: {
      type: Date,
      required: [true, 'transactionDate is required'],
      default: Date.now
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

// Virtual for human-readable major currency units (e.g., 125.50)
transactionSchema.virtual('amount')
  .get(function () {
    return toMajorUnits(this.amountMinor);
  })
  .set(function (val) {
    this.amountMinor = toMinorUnits(val);
  });

// Compound indexes strictly as specified in project plan
transactionSchema.index({ userId: 1, transactionDate: -1 });
transactionSchema.index({ userId: 1, type: 1, transactionDate: -1 });
transactionSchema.index({ userId: 1, category: 1, transactionDate: -1 });

const Transaction = mongoose.model('Transaction', transactionSchema);

export default Transaction;
