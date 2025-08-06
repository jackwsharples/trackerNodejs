const net = require('net');
const https = require('https');

// Configuration
const TCP_PORT = process.env.PORT || 7000; // Railway will assign this
const TARGET_HTTP_SERVICE = 'https://mototrac.up.railway.app'; // Your main service URL

console.log(`🚀 TCP GPS Service starting on port ${TCP_PORT}`);
console.log(`📡 Will forward data to: ${TARGET_HTTP_SERVICE}`);

// Create TCP server
const tcpServer = net.createServer((socket) => {
  console.log('📡 GPS Tracker connected from:', socket.remoteAddress);
  
  let connectionStartTime = Date.now();
  let dataCount = 0;

  socket.on('data', (data) => {
    dataCount++;
    const timestamp = new Date().toISOString();
    const raw = data.toString().trim();
    const hex = data.toString('hex');
    
    console.log(`📨 Data packet #${dataCount} received:`);
    console.log('  Timestamp:', timestamp);
    console.log('  String:', raw);
    console.log('  Hex:', hex);
    console.log('  Length:', data.length);
    
    // Try to parse GPS data
    const parsedData = parseSTGPS(raw, hex);
    
    if (parsedData) {
      console.log('✅ GPS data parsed:', parsedData);
      
      // Forward to main HTTP service
      forwardToHTTPService({
        lat: parsedData.lat,
        lon: parsedData.lon,
        timestamp: parsedData.timestamp || timestamp,
        imei: parsedData.imei || socket.remoteAddress,
        speed: parsedData.speed || null,
        altitude: parsedData.altitude || null,
        source: 'tcp-service'
      });
      
      // Send acknowledgment to tracker
      socket.write('OK\r\n');
    } else {
      console.log('⚠️  Could not parse GPS data - forwarding raw data for analysis');
      
      // Forward raw data for debugging
      forwardToHTTPService({
        lat: null,
        lon: null,
        timestamp: timestamp,
        imei: socket.remoteAddress,
        rawData: raw,
        hexData: hex,
        debug: true,
        source: 'tcp-service'
      });
    }
  });

  socket.on('end', () => {
    const connectionDuration = Date.now() - connectionStartTime;
    console.log('❌ GPS Tracker disconnected');
    console.log(`📊 Connection summary: ${dataCount} packets in ${connectionDuration}ms`);
  });

  socket.on('error', (err) => {
    console.error('⚠️  TCP socket error:', err.message);
  });
});

// Forward data to main HTTP service
function forwardToHTTPService(gpsData) {
  const postData = JSON.stringify(gpsData);
  
  const options = {
    hostname: 'mototrac.up.railway.app',
    port: 443,
    path: '/ping',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'User-Agent': 'TCP-GPS-Service/1.0'
    }
  };

  const req = https.request(options, (res) => {
    console.log(`📤 Forwarded to HTTP service - Status: ${res.statusCode}`);
    
    res.on('data', (chunk) => {
      console.log('📥 HTTP service response:', chunk.toString());
    });
  });

  req.on('error', (err) => {
    console.error('❌ Error forwarding to HTTP service:', err.message);
  });

  req.write(postData);
  req.end();
}

// Parse ST-915L GPS data
function parseSTGPS(rawString, hexString) {
  try {
    console.log('🔍 Attempting to parse GPS data...');
    
    // Pattern 1: Look for decimal coordinates
    const decimalMatch = rawString.match(/(-?\d+\.\d+),(-?\d+\.\d+)/);
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
    
    // Pattern 3: Common GPS tracker formats
    const parts = rawString.split(',');
    if (parts.length >= 8) {
      // Try different field orders common in GPS trackers
      for (let i = 0; i < parts.length - 1; i++) {
        const lat = parseFloat(parts[i]);
        const lon = parseFloat(parts[i + 1]);
        if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
          console.log(`✅ Found coordinates at positions ${i}, ${i + 1}`);
          return { lat, lon };
        }
      }
    }
    
    // Pattern 4: Hex-encoded data
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
  // Parse GPRMC (Recommended Minimum Specific GPS/TRANSIT Data)
  const gprmcMatch = nmeaString.match(/\$G[PN]RMC,([^*]+)/);
  if (gprmcMatch) {
    const parts = gprmcMatch[1].split(',');
    if (parts.length >= 9 && parts[1] === 'A') { // Status must be 'A' (active)
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
  // This will need to be customized based on your ST-915L's specific hex format
  // For now, just a placeholder
  try {
    // Example: Some trackers encode lat/lon as 4-byte floats in hex
    if (hexString.length >= 16) {
      // This is just an example - you'll need to adjust based on actual format
      console.log('🔍 Attempting hex coordinate parsing...');
      // Add specific hex parsing logic here once we see the data format
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
tcpServer.listen(TCP_PORT, '0.0.0.0', () => {
  console.log(`🚀 TCP GPS Service listening on port ${TCP_PORT}`);
  console.log(`📡 Ready to receive GPS data and forward to ${TARGET_HTTP_SERVICE}`);
});

// Health check endpoint (minimal HTTP for Railway)
const express = require('express');
const app = express();

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'TCP GPS Forwarder',
    target: TARGET_HTTP_SERVICE,
    timestamp: new Date().toISOString()
  });
});

// This won't interfere with TCP since we're not creating a domain for this service
const healthPort = TCP_PORT + 1;
app.listen(healthPort, () => {
  console.log(`💚 Health check available on port ${healthPort}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down TCP GPS service...');
  tcpServer.close();
});