const express = require('express');
const path = require('path');
const net = require('net');
const { router, gpsPings } = require('./routes/index');

const app = express();
const HTTP_PORT = process.env.PORT || 3000;
const TCP_PORT = 7000; // Fixed port that matches Railway TCP proxy

// JSON parsing and static files
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/', router);

// 404 handler
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'views', '404.html'));
});

// Create TCP server
const tcpServer = net.createServer((socket) => {
  console.log('📡 GPS Tracker connected:', socket.remoteAddress);

  socket.on('data', (data) => {
    const raw = data.toString().trim();
    console.log('📨 Raw TCP data:', raw);

    // Parse the GPS data
    const parsedData = parseGPSData(raw);
    if (parsedData) {
      const ping = {
        lat: parseFloat(parsedData.lat),
        lon: parseFloat(parsedData.lon),
        timestamp: parsedData.timestamp || new Date().toISOString(),
        imei: parsedData.imei || parsedData.deviceId || socket.remoteAddress,
        speed: parsedData.speed || null,
        altitude: parsedData.altitude || null
      };

      gpsPings.push(ping);
      console.log('✅ Stored TCP GPS ping:', ping);

      // Keep only last 100 pings
      if (gpsPings.length > 100) {
        gpsPings.shift();
      }

      // Send acknowledgment back to tracker if needed
      socket.write('OK\r\n');
    } else {
      console.warn('⚠️ Could not parse GPS data:', raw);
    }
  });

  socket.on('end', () => {
    console.log('❌ GPS Tracker disconnected');
  });

  socket.on('error', (err) => {
    console.error('⚠️ TCP socket error:', err.message);
  });
});

function parseGPSData(rawString) {
  // Add your ST-915L specific parsing logic here
  // This is just an example - customize based on your tracker's protocol
  
  try {
    // Example: Look for patterns like "lat:35.123,lon:-81.456,time:..."
    const latMatch = rawString.match(/lat:([+-]?\d+\.?\d*)/i);
    const lonMatch = rawString.match(/lon:([+-]?\d+\.?\d*)/i);
    
    if (latMatch && lonMatch) {
      return {
        lat: parseFloat(latMatch[1]),
        lon: parseFloat(lonMatch[1]),
        timestamp: new Date().toISOString()
      };
    }
    
    // Add more parsing patterns as needed
    return null;
  } catch (error) {
    console.error('GPS parsing error:', error);
    return null;
  }
}

// Start servers
Promise.all([
  new Promise((resolve, reject) => {
    const httpServer = app.listen(HTTP_PORT, '0.0.0.0', () => {
      console.log(`🌐 HTTP server running on port ${HTTP_PORT}`);
      resolve(httpServer);
    });
    httpServer.on('error', reject);
  }),
  
  new Promise((resolve, reject) => {
    tcpServer.listen(TCP_PORT, '0.0.0.0', () => {
      console.log(`🚀 TCP server running on port ${TCP_PORT}`);
      resolve(tcpServer);
    });
    tcpServer.on('error', reject);
  })
]).catch(error => {
  console.error('❌ Server startup error:', error);
  process.exit(1);
});