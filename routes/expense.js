const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

const expenseSchema = new mongoose.Schema({
  date: Date,
  description: String,
  category: String,
  value: Number,
  credit: Boolean
});
const expense = mongoose.model('expenses', expenseSchema);

function validateMonth(month, res, isUndefinedValid = false) {
  let invalid = false;
  if (isUndefinedValid) {
    invalid = month < 1 || month > 12;
  } else {
    invalid = month == undefined || month < 1 || month > 12;
  }
  if (invalid) {
    return res.status(422).json({
      message: 'Invalid month',
      data: month
    });
  }
}

function validateYear(year, res) {
  if (year == undefined || year < 1970) {
    return res.status(422).json({
      message: 'Invalid year',
      data: year
    });
  }
}

function getLastDay(year, month) {
  return new Date(year, month, 0).getDate();
}

function getStartDate(year, month) {
  let monthString;
  if (month == undefined) {
    monthString = `01`;
  } else if (month >= 1 && month <= 9) {
    monthString = `0${month}`;
  } else if (month >= 10 && month <= 12) {
    monthString = `${month}`;
  }
  return new Date(`${year}-${monthString}-01T00:00:00.000Z`);
}

function getEndDate(year, month) {
  let monthString;
  let dayString;
  if (month == undefined) {
    monthString = '12';
    dayString = '31'
  } else if (month >= 1 && month <= 9) {
    monthString = `0${month}`;
    dayString = getLastDay(year, month);
  } else if (month >= 10 && month <= 12) {
    monthString = `${month}`;
    dayString = getLastDay(year, month);
  }
  return new Date(`${year}-${monthString}-${dayString}T23:59:59.000Z`);
}

router.get('', (req, res, next) => {
  const year = req.query.year;
  const month = req.query.month;
  validateMonth(month, res, true);
  validateYear(year, res);
  const start = getStartDate(year, month);
  const end = getEndDate(year, month); 
  expense.find(
    { date: { $gte: start, $lte: end } }, 
    null, 
    { sort : { date : 1 } 
  }).then(docs => {
    res.status(200).json({
      message: 'Expenses fetched successfully!',
      data: docs
    });
  });
});

router.get('/sum', (req, res, next) => {
  const year = req.query.year;
  const month = req.query.month;
  validateMonth(month, res, true);
  validateYear(year, res);
  const start = getStartDate(year, month);
  const end = getEndDate(year, month);
  expense.aggregate([
    { $match: { 
      date: { $gte: start, $lte: end }
    } },
    { $group: { 
      _id: { $month: { date: '$date' } }, 
      count: { $sum: 1 },
      total: { $sum: '$value'}
    } }
  ]).then(docs => {
    res.status(200).json({
      message: 'Sum of expenses fetched successfully!',
      data: docs
    });
  });
});

router.post('', (req, res, next) => {
  const newExpense = new expense(req.body);
  newExpense.save().then(doc => {
    res.status(201).json({
      message: 'Expense saved successfully!'
    });
  });
});

router.put('/:id', (req, res, next) => {
  expense.updateOne({ _id: req.params.id }, req.body)
    .then(result => {
      if (result.nModified > 0) {
        res.status(200).json({message: 'Expense updated successfully'});
      }
    })
});

router.delete('/:id', (req, res, next) => {
  expense.deleteOne({ _id: req.params.id }).then(() => {
    res.status(204).json({
      message: 'Expense deleted successfully!'
    });
  });
});

module.exports = router;
