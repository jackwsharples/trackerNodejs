const express = require('express');
const path = require('path');
const router = express.Router();

//In mem temp storage
const gpsPings = [];

// Serve a simple homepage
router.get('/', (req, res) => {
  try {
    const filePath = path.resolve(__dirname, '../views/index.html');
    res.sendFile(filePath);
  } catch (err) {
    console.error('Error serving index.html:', err);
    res.status(500).send('Internal Server Error');
  }
});



// Receive GPS pings
router.post('/ping', express.json(), (req, res) => {
  const { lat, lon, timestamp } = req.body || {};

  if (lat === undefined || lon === undefined || timestamp === undefined) {
    console.warn('Bad ping data received:', req.body);
    return res.status(400).send('Missing required fields');
  }

  const ping = { lat, lon, timestamp };
  gpsPings.push(ping);

  console.log('Received ping:', { lat, lon, timestamp });
  res.status(200).send('Ping received');
});

// GET /pings – retrieve all GPS pings
router.get('/pings', (req, res) => {
  res.json(gpsPings);
});

module.exports = router;