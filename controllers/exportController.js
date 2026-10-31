import { Parser } from 'json2csv';
import PDFDocument from 'pdfkit';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';

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
    const currencySymbol = currencyCode === 'INR' ? '₹' : '$';

    // Calculate aggregate metrics across all filtered records
    let incomeMinor = 0;
    let expenseMinor = 0;
    transactions.forEach((t) => {
      if (t.type === 'income') {
        incomeMinor += t.amountMinor;
      } else if (t.type === 'expense') {
        expenseMinor += t.amountMinor;
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
          'Category': t.category.replace(/_/g, ' '),
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

      // Header Branding: Clarivo — Transaction report
      doc.fillColor('#047857').fontSize(20).text('Clarivo — Transaction report', 40, 40);
      doc.fillColor('#475569').fontSize(10).text('Your money, made clear.', 40, 65);

      // Emerald Accent Separator Line
      doc.strokeColor('#047857').lineWidth(2).moveTo(40, 82).lineTo(555, 82).stroke();

      // Metadata Section
      doc.fillColor('#0F172A').fontSize(9);
      doc.text(`Account: ${user?.name || 'User'} (${req.user.email})`, 40, 95);
      doc.text(`Exported on: ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`, 350, 95, { align: 'right' });

      // Applied Filters Line
      const filterDesc = [
        `Period: ${from || 'All time'} to ${to || 'Present'}`,
        `Type: ${type ? type.toUpperCase() : 'All'}`,
        `Category: ${category ? category.replace(/_/g, ' ') : 'All'}`
      ].join('  |  ');

      doc.fillColor('#64748B').fontSize(8.5).text(`Filters: ${filterDesc}`, 40, 110);

      // Summary Statistics Box
      doc.rect(40, 130, 515, 55).fillAndStroke('#F0FDF4', '#86EFAC');

      // Income Metric
      doc.fillColor('#059669').fontSize(8).text('TOTAL INCOME', 55, 140);
      doc.fontSize(13).text(`+${currencySymbol}${totalIncome.toFixed(2)}`, 55, 153);

      // Expense Metric
      doc.fillColor('#E11D48').fontSize(8).text('TOTAL EXPENSES', 220, 140);
      doc.fontSize(13).text(`-${currencySymbol}${totalExpense.toFixed(2)}`, 220, 153);

      // Net Cash Flow Metric
      doc.fillColor('#047857').fontSize(8).text('NET CASH FLOW', 390, 140);
      const netSign = netCashFlow >= 0 ? '+' : '';
      doc.fillColor(netCashFlow >= 0 ? '#047857' : '#E11D48').fontSize(13).text(`${netSign}${currencySymbol}${netCashFlow.toFixed(2)}`, 390, 153);

      // Table Header Setup
      let y = 205;
      doc.rect(40, y, 515, 20).fill('#F1F5F9');
      doc.fillColor('#0F172A').fontSize(8.5);
      doc.text('Date', 45, y + 5, { width: 70 });
      doc.text('Type', 120, y + 5, { width: 55 });
      doc.text('Category', 180, y + 5, { width: 95 });
      doc.text('Notes', 280, y + 5, { width: 175 });
      doc.text('Amount', 465, y + 5, { width: 85, align: 'right' });
      y += 20;

      // Render Transaction Rows
      transactions.forEach((t, idx) => {
        // Page break if row exceeds page boundary
        if (y > 750) {
          doc.addPage();
          y = 40;
          doc.rect(40, y, 515, 20).fill('#F1F5F9');
          doc.fillColor('#0F172A').fontSize(8.5);
          doc.text('Date', 45, y + 5, { width: 70 });
          doc.text('Type', 120, y + 5, { width: 55 });
          doc.text('Category', 180, y + 5, { width: 95 });
          doc.text('Notes', 280, y + 5, { width: 175 });
          doc.text('Amount', 465, y + 5, { width: 85, align: 'right' });
          y += 20;
        }

        // Alternating row background for readability
        if (idx % 2 === 1) {
          doc.rect(40, y, 515, 18).fill('#F8FAFC');
        }

        const dateStr = t.transactionDate.toISOString().split('T')[0];
        const isIncome = t.type === 'income';
        const formattedAmount = `${isIncome ? '+' : '-'}${currencySymbol}${(t.amountMinor / 100).toFixed(2)}`;

        doc.fillColor('#334155').fontSize(8);
        doc.text(dateStr, 45, y + 4, { width: 70 });
        doc.fillColor(isIncome ? '#059669' : '#E11D48').text(t.type.toUpperCase(), 120, y + 4, { width: 55 });
        doc.fillColor('#334155').text(t.category.replace(/_/g, ' '), 180, y + 4, { width: 95 });
        doc.fillColor('#64748B').text(t.notes || '—', 280, y + 4, { width: 175, height: 12, ellipsis: true });
        doc.fillColor(isIncome ? '#059669' : '#E11D48').text(formattedAmount, 465, y + 4, { width: 85, align: 'right' });

        y += 18;
      });

      // Bottom border for table
      doc.strokeColor('#E2E8F0').lineWidth(0.5).moveTo(40, y).lineTo(555, y).stroke();

      // Add page numbers on all pages in footer
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.fillColor('#94A3B8').fontSize(8);
        doc.text(
          `Clarivo Personal Finance Tracker  •  Page ${i + 1} of ${range.count}`,
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

