const express = require('express');
const path = require('path');
const router = express.Router();

// Serve a simple homepage
router.get('/', (req, res) => {
  res.sendFile(path.resolve('views/404.html'));
});

// Receive GPS pings
router.post('/ping', (req, res) => {
  const { lat, lon, timestamp } = req.body;
  console.log('Received ping:', { lat, lon, timestamp });

  // TODO: Save to memory/database (for now, maybe just an in-memory array)
  res.status(200).send('Ping received');
});

module.exports = router;