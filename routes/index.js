const express = require('express');
const path = require('path');
const router = express.Router();

const pings = []; // keep this outside to persist

router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../views/index.html'));
});

router.post('/ping', express.json(), (req, res) => {
  const { lat, lon, timestamp } = req.body;
  if (!lat || !lon) {
    return res.status(400).send('Missing coordinates');
  }

  console.log('Received ping:', { lat, lon, timestamp });
  pings.push({ lat, lon, timestamp });
  res.status(200).send('Ping received');
});

router.get('/api/pings', (req, res) => {
  try {
    res.json(pings);
  } catch (err) {
    console.error('Error returning pings:', err);
    res.status(500).send('Server error');
  }
});

module.exports = router;
