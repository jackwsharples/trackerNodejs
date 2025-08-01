const express = require('express');
const path = require('path');
const router = express.Router();

// Serve a simple homepage
router.get('/', (req, res) => {
  res.sendFile(path.resolve('views/404.html'));
});

// Receive GPS pings
router.post('/ping', express.json(), (req, res) => {
  const { lat, lon, timestamp } = req.body || {};

  if (lat === undefined || lon === undefined || timestamp === undefined) {
    console.warn('Bad ping data received:', req.body);
    return res.status(400).send('Missing required fields');
  }

  console.log('Received ping:', { lat, lon, timestamp });
  res.status(200).send('Ping received');
});


module.exports = router;