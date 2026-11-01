import { Parser } from 'json2csv';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Category display labels mapping internal keys to friendly titles
const CATEGORY_LABELS = {
  salary: 'Salary',
  freelance: 'Freelance',
  investments: 'Investments',
  other_income: 'Other Income',
  housing: 'Housing',
  food_dining: 'Food & Dining',
  transportation: 'Transportation',
  utilities: 'Utilities',
  entertainment: 'Entertainment',
  healthcare: 'Healthcare',
  shopping: 'Shopping',
  other_expense: 'Other Expense'
};

// GET /exports/transactions?format=csv|pdf - Export user's filtered transactions
export const exportTransactions = async (req, res, next) => {
  try {
    const { format = 'csv', from, to, type, category, sort = 'date_desc' } = req.query;

    // Build filter scoped strictly to authenticated user
    const filter = { userId: req.user.id };
    if (type) filter.type = type;
    if (category) filter.category = category;

    // Apply date range filter
    if (from || to) {
      filter.transactionDate = {};
      if (from) filter.transactionDate.$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        if (to.length === 10) toDate.setUTCHours(23, 59, 59, 999);
        filter.transactionDate.$lte = toDate;
      }
    }

    // Sort order mapping
    const sortMap = {
      date_desc: { transactionDate: -1, _id: -1 },
      date_asc: { transactionDate: 1, _id: 1 },
      amount_desc: { amountMinor: -1, _id: -1 },
      amount_asc: { amountMinor: 1, _id: 1 }
    };
    const sortCriteria = sortMap[sort] || { transactionDate: -1, _id: -1 };

    // Fetch user details and matching transactions concurrently
    const [user, transactions] = await Promise.all([
      User.findById(req.user.id),
      Transaction.find(filter).sort(sortCriteria)
    ]);

    const currencyCode = user?.currencyCode || 'INR';

    // Calculate aggregate metrics across all filtered records
    let incomeMinor = 0;
    let expenseMinor = 0;
    let incomeCount = 0;
    let expenseCount = 0;

    transactions.forEach((t) => {
      if (t.type === 'income') {
        incomeMinor += t.amountMinor;
        incomeCount++;
      } else if (t.type === 'expense') {
        expenseMinor += t.amountMinor;
        expenseCount++;
      }
    });

    const totalIncome = incomeMinor / 100;
    const totalExpense = expenseMinor / 100;
    const netCashFlow = (incomeMinor - expenseMinor) / 100;

    // Today's date string for export filenames (e.g. 2026-10-31)
    const todayString = new Date().toISOString().split('T')[0];

    // -------------------------------------------------------------
    // CSV EXPORT GENERATION
    // -------------------------------------------------------------
    if (format === 'csv') {
      const csvData = transactions.map((t) => {
        const dateStr = t.transactionDate.toISOString().split('T')[0];
        const decimalAmount = (t.amountMinor / 100).toFixed(2);
        return {
          'Transaction Date': dateStr,
          'Type': t.type.toUpperCase(),
          'Category': CATEGORY_LABELS[t.category] || t.category.replace(/_/g, ' '),
          'Amount': decimalAmount,
          'Currency': t.currencyCode || currencyCode,
          'Notes': t.notes || ''
        };
      });

      // Parse records to CSV using json2csv
      const fields = ['Transaction Date', 'Type', 'Category', 'Amount', 'Currency', 'Notes'];
      const parser = new Parser({ fields });
      const csv = parser.parse(csvData);

      // Set download headers per DESIGN.md (clarivo-transactions-YYYY-MM-DD.csv)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="clarivo-transactions-${todayString}.csv"`);
      return res.status(200).send(csv);
    }

    // -------------------------------------------------------------
    // PDF EXPORT GENERATION
    // -------------------------------------------------------------
    if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });

      // Set download headers per DESIGN.md (clarivo-transactions-YYYY-MM-DD.pdf)
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="clarivo-transactions-${todayString}.pdf"`);
      doc.pipe(res);

      // Handle PDF stream errors safely
      doc.on('error', (pdfErr) => {
        if (!res.headersSent) {
          next(pdfErr);
        }
      });

      // Register bundled Unicode font supporting Indian Rupee symbol (₹)
      const regularFontPath = path.resolve(__dirname, '../assets/fonts/Inter-Regular.ttf');
      const boldFontPath = path.resolve(__dirname, '../assets/fonts/Inter-Bold.ttf');
      const hasCustomFonts = fs.existsSync(regularFontPath) && fs.existsSync(boldFontPath);

      if (hasCustomFonts) {
        doc.registerFont('AppFont', regularFontPath);
        doc.registerFont('AppFont-Bold', boldFontPath);
      }

      const fontRegular = hasCustomFonts ? 'AppFont' : 'Helvetica';
      const fontBold = hasCustomFonts ? 'AppFont-Bold' : 'Helvetica-Bold';
      const currencySymbol = currencyCode === 'INR' ? (hasCustomFonts ? '₹' : 'Rs. ') : '$';

      // Format currency with Indian grouping commas and proper sign placement
      const formatAmount = (num) => {
        return Math.abs(num).toLocaleString('en-IN', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
      };

      // Header Branding: Clarivo — Transaction report
      doc.font(fontBold).fillColor('#047857').fontSize(20).text('Clarivo — Transaction report', 40, 40);
      doc.font(fontRegular).fillColor('#475569').fontSize(10).text('Your money, made clear.', 40, 65);

      // Emerald Accent Separator Line
      doc.strokeColor('#047857').lineWidth(2).moveTo(40, 82).lineTo(555, 82).stroke();

      // Metadata Section
      doc.font(fontRegular).fillColor('#0F172A').fontSize(9);
      doc.text(`Account: ${user?.name || 'User'} (${req.user.email})`, 40, 95);
      doc.text(`Exported on: ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`, 350, 95, { align: 'right' });

      // Applied Filters Line
      const filterDesc = [
        `Period: ${from || 'All time'} to ${to || 'Present'}`,
        `Type: ${type ? type.toUpperCase() : 'All'}`,
        `Category: ${category ? (CATEGORY_LABELS[category] || category.replace(/_/g, ' ')) : 'All'}`
      ].join('  |  ');

      doc.fillColor('#64748B').fontSize(8.5).text(`Filters: ${filterDesc}`, 40, 110);

      // 3 Dedicated Summary Cards (Total Income, Total Expenses, Net Cash Flow)
      const cardY = 128;
      const cardH = 56;
      const cardW = 165;
      const cardGap = 10;

      // Card 1: Total Income
      doc.roundedRect(40, cardY, cardW, cardH, 8).fillAndStroke('#F0FDF4', '#BBF7D0');
      doc.font(fontBold).fillColor('#047857').fontSize(7.5).text('TOTAL RECORDED INCOME', 50, cardY + 8);
      doc.font(fontBold).fillColor('#059669').fontSize(12).text(`+${currencySymbol}${formatAmount(totalIncome)}`, 50, cardY + 22);
      doc.font(fontRegular).fillColor('#64748B').fontSize(7).text(`${incomeCount} recorded receipt${incomeCount === 1 ? '' : 's'}`, 50, cardY + 40);

      // Card 2: Total Expenses
      const card2X = 40 + cardW + cardGap;
      doc.roundedRect(card2X, cardY, cardW, cardH, 8).fillAndStroke('#FFF1F2', '#FECDD3');
      doc.font(fontBold).fillColor('#BE123C').fontSize(7.5).text('TOTAL RECORDED EXPENSES', card2X + 10, cardY + 8);
      doc.font(fontBold).fillColor('#E11D48').fontSize(12).text(`-${currencySymbol}${formatAmount(totalExpense)}`, card2X + 10, cardY + 22);
      doc.font(fontRegular).fillColor('#64748B').fontSize(7).text(`${expenseCount} recorded expenditure${expenseCount === 1 ? '' : 's'}`, card2X + 10, cardY + 40);

      // Card 3: Net Cash Flow
      const card3X = card2X + cardW + cardGap;
      const isPositiveCashFlow = netCashFlow >= 0;
      doc.roundedRect(card3X, cardY, cardW, cardH, 8).fillAndStroke(
        isPositiveCashFlow ? '#F0FDF4' : '#FFF1F2',
        isPositiveCashFlow ? '#BBF7D0' : '#FECDD3'
      );
      doc.font(fontBold).fillColor(isPositiveCashFlow ? '#047857' : '#BE123C').fontSize(7.5).text('NET CASH FLOW', card3X + 10, cardY + 8);
      const netSign = isPositiveCashFlow ? '+' : '-';
      doc.font(fontBold).fillColor(isPositiveCashFlow ? '#047857' : '#E11D48').fontSize(12).text(
        `${netSign}${currencySymbol}${formatAmount(netCashFlow)}`,
        card3X + 10,
        cardY + 22
      );
      doc.font(fontRegular).fillColor('#64748B').fontSize(7).text(
        isPositiveCashFlow ? 'Recorded balance surplus' : 'Recorded balance deficit',
        card3X + 10,
        cardY + 40
      );

      // Table Header Setup
      let y = 198;
      doc.roundedRect(40, y, 515, 22, 4).fill('#F1F5F9');
      doc.font(fontBold).fillColor('#0F172A').fontSize(8.5);
      doc.text('Date', 50, y + 6, { width: 65 });
      doc.text('Type', 120, y + 6, { width: 55 });
      doc.text('Category', 180, y + 6, { width: 95 });
      doc.text('Notes', 280, y + 6, { width: 170 });
      doc.text('Amount', 455, y + 6, { width: 90, align: 'right' });
      y += 24;

      // Render Transaction Rows
      transactions.forEach((t, idx) => {
        // Page break if row exceeds page boundary
        if (y > 740) {
          doc.addPage();
          y = 40;
          doc.roundedRect(40, y, 515, 22, 4).fill('#F1F5F9');
          doc.font(fontBold).fillColor('#0F172A').fontSize(8.5);
          doc.text('Date', 50, y + 6, { width: 65 });
          doc.text('Type', 120, y + 6, { width: 55 });
          doc.text('Category', 180, y + 6, { width: 95 });
          doc.text('Notes', 280, y + 6, { width: 170 });
          doc.text('Amount', 455, y + 6, { width: 90, align: 'right' });
          y += 24;
        }

        // Alternating row background for readability
        if (idx % 2 === 1) {
          doc.roundedRect(40, y - 2, 515, 18, 2).fill('#F8FAFC');
        }

        const dateStr = t.transactionDate.toISOString().split('T')[0];
        const isIncome = t.type === 'income';
        const formattedAmount = `${isIncome ? '+' : '-'}${currencySymbol}${formatAmount(t.amountMinor / 100)}`;
        const categoryLabel = CATEGORY_LABELS[t.category] || t.category.replace(/_/g, ' ');

        doc.font(fontRegular).fillColor('#334155').fontSize(8);
        doc.text(dateStr, 50, y + 3, { width: 65 });
        doc.font(fontBold).fillColor(isIncome ? '#059669' : '#E11D48').text(t.type.toUpperCase(), 120, y + 3, { width: 55 });
        doc.font(fontRegular).fillColor('#334155').text(categoryLabel, 180, y + 3, { width: 95 });
        doc.fillColor('#64748B').text(t.notes || '—', 280, y + 3, { width: 170, height: 12, ellipsis: true });
        doc.font(fontBold).fillColor(isIncome ? '#059669' : '#E11D48').text(formattedAmount, 455, y + 3, { width: 90, align: 'right' });

        y += 18;
      });

      // Render Empty State Row if 0 transactions match
      if (transactions.length === 0) {
        doc.roundedRect(40, y, 515, 26, 4).fill('#F8FAFC');
        doc.font(fontRegular).fillColor('#64748B').fontSize(8.5).text('No transactions found matching the selected criteria.', 40, y + 8, {
          align: 'center',
          width: 515
        });
        y += 26;
      }

      // Bottom border for table
      doc.strokeColor('#E2E8F0').lineWidth(0.5).moveTo(40, y + 4).lineTo(555, y + 4).stroke();

      // Add page numbers on all pages in footer
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.font(fontRegular).fillColor('#94A3B8').fontSize(8);
        doc.text(
          `Clarivo Personal Finance Tracker  •  Your money, made clear  •  Page ${i + 1} of ${range.count}`,
          40,
          790,
          { align: 'center', width: 515 }
        );
      }

      doc.end();
      return;
    }

    return res.status(400).json({ message: 'Invalid format: must be "csv" or "pdf"' });
  } catch (err) {
    next(err);
  }
};

