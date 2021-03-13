const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/family-budget', {useNewUrlParser: true, useUnifiedTopology: true})
    .then(() => console.info('db connected:', true))
    .catch(err => console.error('db connection error:', err));

const expenseRoutes = require('./routes/expense')
const incomeRoutes = require('./routes/income')

const app = express();

app.use(bodyParser.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  next();
});

app.use('/api/v1/expenses', expenseRoutes);
app.use('/api/v1/incomes', incomeRoutes);

app.get('/', (req, res) => {
    return res.json({
        app: 'Family Budget API',
        version: '1'
    });
});
app.listen(3333);
