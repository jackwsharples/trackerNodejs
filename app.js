const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// GPS data storage (in-memory for now)
const gpsPings = [];

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Receive GPS pings from TCP service
app.post('/ping', (req, res) => {
  console.log('📨 Received ping from TCP service:', req.body);
  
  const { lat, lon, timestamp, imei, rawData, debug, source } = req.body;

  // Handle both parsed and debug data
  if (debug) {
    // Store debug data for analysis
    const debugPing = {
      lat: null,
      lon: null,
      timestamp: timestamp || new Date().toISOString(),
      imei: imei || 'unknown',
      rawData: rawData,
      debug: true,
      source: source || 'unknown'
    };
    
    gpsPings.push(debugPing);
    console.log('🐛 Debug ping stored:', debugPing);
    
  } else if (lat && lon) {
    // Store valid GPS data
    const ping = {
      lat: parseFloat(lat),
      lon: parseFloat(lon),
      timestamp: timestamp || new Date().toISOString(),
      imei: imei || 'unknown',
      speed: req.body.speed || null,
      altitude: req.body.altitude || null,
      source: source || 'tcp-service'
    };
    
    gpsPings.push(ping);
    console.log('✅ GPS ping stored:', ping);
    
  } else {
    console.warn('⚠️  Invalid ping data received:', req.body);
    return res.status(400).json({ error: 'Missing lat/lon coordinates' });
  }

  // Keep only last 100 pings
  if (gpsPings.length > 100) {
    gpsPings.shift();
  }

  res.status(200).json({ status: 'received', count: gpsPings.length });
});

// API endpoints
app.get('/pings', (req, res) => {
  res.json({
    count: gpsPings.length,
    pings: gpsPings
  });
});

app.get('/latest', (req, res) => {
  const latest = gpsPings[gpsPings.length - 1] || null;
  res.json(latest);
});

// Get only valid GPS coordinates (not debug data)
app.get('/coordinates', (req, res) => {
  const validPings = gpsPings.filter(ping => !ping.debug && ping.lat !== null && ping.lon !== null);
  res.json({
    count: validPings.length,
    coordinates: validPings
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'GPS Tracker HTTP Service',
    pings_stored: gpsPings.length,
    timestamp: new Date().toISOString()
  });
});

// Catch-all for debugging
app.all('*', (req, res) => {
  console.log('🔍 Unhandled request:', req.method, req.path, req.body || req.query);
  res.status(404).json({ 
    error: 'Not found', 
    method: req.method, 
    path: req.path,
    available_endpoints: ['/ping', '/pings', '/latest', '/coordinates', '/health']
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 GPS Tracker HTTP Service running on port ${PORT}`);
  console.log(`📡 Ready to receive GPS data from TCP service`);
  console.log(`🔗 Available at: https://your-app.up.railway.app`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down HTTP service...');
  process.exit(0);
});