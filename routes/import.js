const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Reuse existing schemas (must match the ones in expense.js and income.js)
const expenseSchema = new mongoose.Schema({
  date: Date,
  description: String,
  category: String,
  value: Number,
  credit: Boolean
});

const incomeSchema = new mongoose.Schema({
  date: Date,
  description: String,
  category: String,
  value: Number
});

// Use existing models if already registered, otherwise create them
const Expense = mongoose.models.expenses || mongoose.model('expenses', expenseSchema);
const Income = mongoose.models.incomes || mongoose.model('incomes', incomeSchema);

/**
 * POST /api/v1/import/csv
 * Accepts a CSV file upload, parses it, and returns a JSON preview.
 * Positive CAD$ → income, negative CAD$ → expense.
 */
router.post('/csv', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const results = [];
  const content = req.file.buffer
    .toString('utf8')
    .replace(/^\uFEFF/, '');

  const stream = Readable.from(content);

  stream
    .pipe(csv())
    .on('data', (row) => {

      const amountStr = (row['CAD$'] || '').trim();
      if (!amountStr || amountStr === '') {
        return; // skip rows with no CAD$ amount
      }

      const amount = parseFloat(amountStr);
      if (isNaN(amount) || amount === 0) {
        return; // skip zero or unparseable amounts
      }

      // Parse date from M/D/YYYY format
      const dateStr = (row['Transaction Date'] || '').trim();
      const dateParts = dateStr.split('/');
      let parsedDate = null;
      if (dateParts.length === 3) {
        const month = dateParts[0].padStart(2, '0');
        const day = dateParts[1].padStart(2, '0');
        const year = dateParts[2];
        parsedDate = `${year}-${month}-${day}`;
      }

      const description1 = (row['Description 1'] || '').trim();
      const description2 = (row['Description 2'] || '').trim();
      const description = description2 ? `${description1} - ${description2}` : description1;

      const accountType = (row['Account Type'] || '').trim();

      results.push({
        date: parsedDate,
        description: description,
        amount: Math.abs(amount),
        type: amount > 0 ? 'income' : 'expense',
        selected: true,
        category: '',
        accountType: accountType
      });
    })
    .on('end', () => {
      res.status(200).json({
        message: 'CSV parsed successfully',
        data: results
      });
    })
    .on('error', (err) => {
      res.status(500).json({ message: 'Error parsing CSV', error: err.message });
    });
});

/**
 * POST /api/v1/import/save
 * Receives an array of finalized transactions and batch-inserts them.
 * Performs duplicate detection based on date + description + value.
 * Body: { transactions: [{ date, description, category, value, type, credit? }] }
 */
router.post('/save', async (req, res) => {
  try {
    const { transactions } = req.body;

    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ message: 'No transactions provided' });
    }

    const expenses = [];
    const incomes = [];
    const duplicates = [];

    for (const txn of transactions) {
      const txnDate = new Date(`${txn.date}T00:00:00.000Z`);
      const value = parseFloat(txn.value);

      if (txn.type === 'expense') {
        // Check for duplicate
        const existing = await Expense.findOne({
          date: txnDate,
          description: txn.description,
          value: value
        });

        if (existing) {
          duplicates.push({
            description: txn.description,
            date: txn.date,
            value: value,
            type: 'expense'
          });
          continue;
        }

        expenses.push({
          date: txnDate,
          description: txn.description,
          category: txn.category,
          value: value,
          credit: txn.credit || false
        });
      } else {
        // Check for duplicate
        const existing = await Income.findOne({
          date: txnDate,
          description: txn.description,
          value: value
        });

        if (existing) {
          duplicates.push({
            description: txn.description,
            date: txn.date,
            value: value,
            type: 'income'
          });
          continue;
        }

        incomes.push({
          date: txnDate,
          description: txn.description,
          category: txn.category,
          value: value
        });
      }
    }

    let savedExpenses = 0;
    let savedIncomes = 0;

    if (expenses.length > 0) {
      const result = await Expense.insertMany(expenses);
      savedExpenses = result.length;
    }

    if (incomes.length > 0) {
      const result = await Income.insertMany(incomes);
      savedIncomes = result.length;
    }

    res.status(201).json({
      message: 'Import completed successfully!',
      savedExpenses,
      savedIncomes,
      duplicatesSkipped: duplicates.length,
      duplicates
    });
  } catch (err) {
    res.status(500).json({ message: 'Error saving transactions', error: err.message });
  }
});

module.exports = router;
