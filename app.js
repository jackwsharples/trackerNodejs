const express = require('express');
const path = require('path');
const indexRouter = require('./routes/index');

const app = express();
const PORT = process.env.PORT || 3000;


app.use(express.json());
// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Use the router for handling routes
app.use('/', indexRouter);

// Catch-all route for handling 404 errors
app.use((req, res, next) => {
    res.status(404).sendFile(path.join(__dirname, 'views', '404.html'));
  });

  console.log('Serving static files from:', path.join(__dirname, 'public'));
console.log('Expecting index.html at:', path.resolve(__dirname, 'views/index.html'));


app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
}).on('error', (err) => {
  console.error('Server failed to start:', err);
});
