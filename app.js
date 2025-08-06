const net = require('net');
const express = require('express');
const path = require('path');

// GPS data storage
const gpsPings = [];

// HTTP server for web interface (uses Railway's main port)
const app = express();
const HTTP_PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve web interface
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// API to get GPS data
app.get('/pings', (req, res) => {
  res.json(gpsPings);
});

app.get('/latest', (req, res) => {
  const latest = gpsPings[gpsPings.length - 1] || null;
  res.json(latest);
});

// Start HTTP server
app.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`🌐 Web interface running on port ${HTTP_PORT}`);
});

// TCP Server for GPS tracker (fixed port 7000 for Railway proxy)
const TCP_PORT = 7000;
const tcpServer = net.createServer((socket) => {
  console.log('📡 GPS Tracker connected from:', socket.remoteAddress);
  
  // Store raw data for analysis
  let connectionData = [];

  socket.on('data', (data) => {
    const timestamp = new Date().toISOString();
    const raw = data.toString().trim();
    const hex = data.toString('hex');
    
    console.log('📨 Raw data received:');
    console.log('  Timestamp:', timestamp);
    console.log('  String:', raw);
    console.log('  Hex:', hex);
    console.log('  Length:', data.length);
    
    // Store raw data for debugging
    connectionData.push({
      timestamp,
      raw,
      hex,
      length: data.length
    });
    
    // Try to parse GPS data
    const parsedData = parseSTGPS(raw, hex);
    if (parsedData) {
      const ping = {
        lat: parseFloat(parsedData.lat),
        lon: parseFloat(parsedData.lon),
        timestamp: parsedData.timestamp || timestamp,
        imei: parsedData.imei || socket.remoteAddress,
        speed: parsedData.speed || null,
        altitude: parsedData.altitude || null,
        rawData: raw // Keep raw for debugging
      };

      gpsPings.push(ping);
      console.log('✅ GPS ping stored:', ping);
      
      // Keep only last 100 pings
      if (gpsPings.length > 100) {
        gpsPings.shift();
      }
      
      // Send acknowledgment if needed
      socket.write('OK\r\n');
    } else {
      console.log('⚠️  Could not parse GPS data - storing raw data for analysis');
      
      // Store unparsed data as a "debug ping" so we can see what's coming in
      const debugPing = {
        lat: null,
        lon: null,
        timestamp: timestamp,
        imei: socket.remoteAddress,
        rawData: raw,
        hexData: hex,
        debug: true
      };
      
      gpsPings.push(debugPing);
    }
  });

  socket.on('end', () => {
    console.log('❌ GPS Tracker disconnected');
    if (connectionData.length > 0) {
      console.log('📊 Connection summary:');
      console.log(`  Total packets received: ${connectionData.length}`);
      console.log('  All data:', JSON.stringify(connectionData, null, 2));
    }
  });

  socket.on('error', (err) => {
    console.error('⚠️  TCP socket error:', err.message);
  });
});

// Parse ST-915L GPS data (customize based on what we discover)
function parseSTGPS(rawString, hexString) {
  try {
    // Pattern 1: Look for coordinates in decimal format
    const decimalCoords = rawString.match(/(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (decimalCoords) {
      const lat = parseFloat(decimalCoords[1]);
      const lon = parseFloat(decimalCoords[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        return { lat, lon };
      }
    }
    
    // Pattern 2: Look for NMEA sentences
    if (rawString.includes('$GP')) {
      const nmeaData = parseNMEA(rawString);
      if (nmeaData) return nmeaData;
    }
    
    // Pattern 3: Look for hex-encoded coordinates
    if (hexString.length > 20) {
      const hexData = parseHexCoords(hexString);
      if (hexData) return hexData;
    }
    
    // Pattern 4: Common tracker protocols
    if (rawString.includes('ST915') || rawString.includes('tracker')) {
      // Add specific ST-915L parsing here once we see the data
    }
    
    return null;
  } catch (error) {
    console.error('GPS parsing error:', error);
    return null;
  }
}

function parseNMEA(nmeaString) {
  // Basic NMEA parsing - customize based on your tracker's output
  const gprmc = nmeaString.match(/\$GPRMC,([^*]+)/);
  if (gprmc) {
    const parts = gprmc[1].split(',');
    if (parts.length >= 9) {
      const lat = convertDMMtoDD(parts[2], parts[3]);
      const lon = convertDMMtoDD(parts[4], parts[5]);
      if (!isNaN(lat) && !isNaN(lon)) {
        return { lat, lon };
      }
    }
  }
  return null;
}

function parseHexCoords(hexString) {
  // Hex parsing logic - will need to customize based on ST-915L protocol
  // This is a placeholder for now
  return null;
}

function convertDMMtoDD(dmm, direction) {
  if (!dmm || !direction) return NaN;
  const degrees = Math.floor(parseFloat(dmm) / 100);
  const minutes = parseFloat(dmm) % 100;
  let dd = degrees + (minutes / 60);
  if (direction === 'S' || direction === 'W') dd *= -1;
  return dd;
}

// Start TCP server
tcpServer.listen(TCP_PORT, '0.0.0.0', () => {
  console.log(`🚀 TCP GPS server listening on port ${TCP_PORT}`);
  console.log(`📡 Configure tracker to: tramway.proxy.rlwy.net:33450`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down servers...');
  tcpServer.close();
});