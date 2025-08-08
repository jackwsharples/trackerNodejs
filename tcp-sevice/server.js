//server.js
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
// Node 18+ has global fetch
async function forwardToHTTPService(gpsData) {
  try {
    const base = (HTTP_SERVICE_URL || '').replace(/\/$/, '');
    const res = await fetch(`${base}/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'TCP-GPS-Service/1.0' },
      body: JSON.stringify(gpsData)
    });

    const body = await res.text();
    stats.packetsForwarded++;
    console.log(`📤 Forwarded to HTTP service - Status: ${res.status}`);

    if (!res.ok) console.log('📥 HTTP service response:', body);
  } catch (err) {
    stats.errors++;
    console.error('❌ Error forwarding to HTTP service:', err.message || err);
  }
}


// Parse ST-915L GPS data
function parseSTGPS(raw /*, hex */) {
  if (raw.startsWith('**HQ')) {
    const p = raw.replace(/^\*\*/, '').replace(/#$/, '').split(',');
    // **HQ,ID,V1,224148,A,3612.8781,N,08140.0749,W,000.00,000,080825,...
    const fixOK = p[4] === 'A';
    if (!fixOK) return null;
    const lat = dmToDec(p[5], p[6]);
    const lon = dmToDec(p[7], p[8]);
    const speedKn = parseFloat(p[9]) || 0;
    return {
      lat, lon,
      speed: speedKn * 1.852,           // knots → km/h (optional)
      timestamp: new Date().toISOString(),
      imei: p[1]                         // the short device ID in HQ frame
    };
  }

  // If one day you want to support binary GT06 packets, handle `hex` here.
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

function dmToDec(dm, hemi) {
  // dm like "3612.8781" or "08140.0749"
  const i = dm.indexOf('.');
  const degStr = dm.slice(0, i - 2);      // all but last 2 pre-decimal are degrees
  const minStr = dm.slice(i - 2);         // last 2 pre-decimal + fraction are minutes
  const deg = parseInt(degStr, 10);
  const mins = parseFloat(minStr);
  let dec = deg + mins / 60;
  if (hemi === 'S' || hemi === 'W') dec = -dec;
  return dec;
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