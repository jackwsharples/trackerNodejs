const express = require('express');
const path = require('path');
const app = express();
const indexRouter = require('./routes/index');

app.use(express.static(path.join(__dirname, 'public')));
app.use('/', indexRouter);

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).send('Internal Server Error');
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'views', '404.html'));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
