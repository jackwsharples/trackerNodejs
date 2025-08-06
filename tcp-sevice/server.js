const net = require('net');
const https = require('https');
const express = require('express');

// Configuration
const TCP_PORT = process.env.PORT || 7000;
const HTTP_SERVICE_URL = process.env.HTTP_SERVICE_URL || 'https://trackernodejs-production.up.railway.app';

console.log(`🚀 TCP GPS Service starting on port ${TCP_PORT}`);
console.log(`📡 Will forward data to: ${HTTP_SERVICE_URL}`);

// Statistics
let stats = {
  connectionsTotal: 0,
  packetsReceived: 0,
  packetsParsed: 0,
  packetsForwarded: 0,
  errors: 0,
  startTime: new Date().toISOString()
};

// Create TCP server for GPS tracker
const tcpServer = net.createServer((socket) => {
  stats.connectionsTotal++;
  console.log(`📡 GPS Tracker connected from: ${socket.remoteAddress} (Connection #${stats.connectionsTotal})`);
  
  let connectionStartTime = Date.now();
  let connectionPackets = 0;

  socket.on('data', (data) => {
    connectionPackets++;
    stats.packetsReceived++;
    
    const timestamp = new Date().toISOString();
    const raw = data.toString().trim();
    const hex = data.toString('hex');
    
    console.log(`📨 Packet #${stats.packetsReceived} from ${socket.remoteAddress}:`);
    console.log(`  String: "${raw}"`);
    console.log(`  Hex: ${hex}`);
    console.log(`  Length: ${data.length} bytes`);
    
    // Try to parse GPS data
    const parsedData = parseSTGPS(raw, hex);
    
    if (parsedData) {
      stats.packetsParsed++;
      console.log('✅ GPS data parsed successfully:', parsedData);
      
      // Forward parsed data to HTTP service
      forwardToHTTPService({
        lat: parsedData.lat,
        lon: parsedData.lon,
        timestamp: parsedData.timestamp || timestamp,
        imei: parsedData.imei || `tcp_${socket.remoteAddress}`,
        speed: parsedData.speed || null,
        altitude: parsedData.altitude || null,
        source: 'tcp-service',
        debug: false
      });
      
      // Send acknowledgment to tracker
      socket.write('OK\r\n');
      
    } else {
      console.log('⚠️  Could not parse GPS data - forwarding raw for analysis');
      
      // Forward raw data for debugging
      forwardToHTTPService({
        lat: null,
        lon: null,
        timestamp: timestamp,
        imei: `tcp_${socket.remoteAddress}`,
        rawData: raw,
        hexData: hex,
        debug: true,
        source: 'tcp-service'
      });
      
      // Still acknowledge to keep connection alive
      socket.write('ACK\r\n');
    }
  });

  socket.on('end', () => {
    const duration = Date.now() - connectionStartTime;
    console.log(`❌ GPS Tracker ${socket.remoteAddress} disconnected`);
    console.log(`📊 Connection summary: ${connectionPackets} packets in ${duration}ms`);
  });

  socket.on('error', (err) => {
    stats.errors++;
    console.error(`⚠️  TCP socket error from ${socket.remoteAddress}:`, err.message);
  });

  socket.on('close', () => {
    console.log(`🔌 Connection closed: ${socket.remoteAddress}`);
  });
});

// Forward data to HTTP service
function forwardToHTTPService(gpsData) {
  const postData = JSON.stringify(gpsData);
  const url = new URL('/ping', HTTP_SERVICE_URL);
  
  const options = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'User-Agent': 'TCP-GPS-Service/1.0'
    },
    timeout: 5000
  };

  const req = https.request(options, (res) => {
    stats.packetsForwarded++;
    console.log(`📤 Forwarded to HTTP service - Status: ${res.statusCode}`);
    
    let responseBody = '';
    res.on('data', (chunk) => {
      responseBody += chunk;
    });
    
    res.on('end', () => {
      if (responseBody) {
        console.log('📥 HTTP service response:', responseBody);
      }
    });
  });

  req.on('error', (err) => {
    stats.errors++;
    console.error('❌ Error forwarding to HTTP service:', err.message);
  });

  req.on('timeout', () => {
    stats.errors++;
    console.error('⏱️  Timeout forwarding to HTTP service');
    req.destroy();
  });

  req.write(postData);
  req.end();
}

// Parse ST-915L GPS data
function parseSTGPS(rawString, hexString) {
  try {
    console.log('🔍 Parsing GPS data...');
    
    // Pattern 1: Direct decimal coordinates (lat,lon)
    const decimalMatch = rawString.match(/(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
    if (decimalMatch) {
      const lat = parseFloat(decimalMatch[1]);
      const lon = parseFloat(decimalMatch[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        console.log('✅ Found decimal coordinates');
        return { lat, lon };
      }
    }
    
    // Pattern 2: NMEA sentences
    if (rawString.includes('$GP') || rawString.includes('$GN')) {
      const nmeaData = parseNMEA(rawString);
      if (nmeaData) {
        console.log('✅ Parsed NMEA data');
        return nmeaData;
      }
    }
    
    // Pattern 3: Comma-separated values (try different field positions)
    const parts = rawString.split(',');
    if (parts.length >= 3) {
      for (let i = 0; i < parts.length - 1; i++) {
        const lat = parseFloat(parts[i]);
        const lon = parseFloat(parts[i + 1]);
        if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
          console.log(`✅ Found coordinates at positions ${i}, ${i + 1}`);
          return { lat, lon };
        }
      }
    }
    
    // Pattern 4: ST915-specific format (customize based on your device manual)
    if (rawString.includes('ST915') || rawString.includes('*')) {
      // Add specific ST-915L parsing logic here
      console.log('🔍 Detected potential ST915 format');
    }
    
    // Pattern 5: Try hex parsing for binary protocols
    if (hexString.length >= 32) {
      const hexData = parseHexCoordinates(hexString);
      if (hexData) {
        console.log('✅ Parsed hex coordinates');
        return hexData;
      }
    }
    
    console.log('⚠️  No recognizable GPS format found');
    return null;
    
  } catch (error) {
    console.error('❌ GPS parsing error:', error);
    return null;
  }
}

function parseNMEA(nmeaString) {
  const gprmcMatch = nmeaString.match(/\$G[PN]RMC,([^*]+)/);
  if (gprmcMatch) {
    const parts = gprmcMatch[1].split(',');
    if (parts.length >= 9 && parts[1] === 'A') { // Status 'A' = active
      const lat = convertDMMtoDD(parts[2], parts[3]);
      const lon = convertDMMtoDD(parts[4], parts[5]);
      if (!isNaN(lat) && !isNaN(lon)) {
        return {
          lat: lat,
          lon: lon,
          speed: parts[6] ? parseFloat(parts[6]) * 1.852 : null, // knots to km/h
          timestamp: new Date().toISOString()
        };
      }
    }
  }
  return null;
}

function parseHexCoordinates(hexString) {
  // Placeholder for hex parsing - customize based on ST-915L protocol
  try {
    if (hexString.length >= 32) {
      console.log('🔍 Analyzing hex data for coordinates...');
      // Add specific hex parsing logic here
    }
  } catch (error) {
    console.error('Hex parsing error:', error);
  }
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
tcpServer.listen(TCP_PORT, '0.0.0.0', (err) => {
  if (err) {
    console.error('❌ Failed to start TCP server:', err);
    process.exit(1);
  }
  console.log(`🚀 TCP GPS Service listening on port ${TCP_PORT}`);
  console.log(`📡 Configure your ST-915L tracker to: [railway-tcp-domain]:${TCP_PORT}`);
});

// Simple HTTP server for health checks and stats
const app = express();
const healthPort = parseInt(TCP_PORT) === 7000 ? 7001 : parseInt(TCP_PORT) + 1;

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'TCP GPS Forwarder',
    tcp_port: TCP_PORT,
    target: HTTP_SERVICE_URL,
    stats: stats,
    timestamp: new Date().toISOString()
  });
});

app.get('/stats', (req, res) => {
  res.json(stats);
});

// Don't bind health server if port conflict
if (healthPort !== parseInt(TCP_PORT)) {
  app.listen(healthPort, () => {
    console.log(`💚 Health check available at port ${healthPort}/health`);
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down TCP GPS service...');
  tcpServer.close(() => {
    console.log('✅ TCP server closed');
    process.exit(0);
  });
});