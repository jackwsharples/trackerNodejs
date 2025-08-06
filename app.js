const express = require('express');
const path = require('path');
const { router } = require('./routes/index');
const app = express();
const PORT = process.env.PORT || 3000;

// Start the TCP server
require('./tcpServer'); // <-- This runs it on startup

// JSON parsing and static files
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/', router);

// 404 handler
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'views', '404.html'));
});

app.listen(PORT, () => {
  console.log(`🌐 HTTP server running at http://localhost:${PORT}/`);
});
