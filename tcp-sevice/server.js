// Test branch
// server.js
const net = require('net');
const https = require('https');
const express = require('express');

// Configuration
const TCP_PORT = process.env.PORT || 7000;
const HTTP_SERVICE_URL = process.env.HTTP_SERVICE_URL || 'https://trackernodejs-staging.up.railway.app';

console.log(`🚀 TCP GPS Service starting on port ${TCP_PORT}`);
console.log(`📡 Will forward data to: ${HTTP_SERVICE_URL.replace(/\/$/, '')}/ping`);

// Stats
let stats = {
  connectionsTotal: 0,
  packetsReceived: 0,
  packetsParsed: 0,
  packetsForwarded: 0,
  errors: 0,
  startTime: new Date().toISOString(),
};

// ---------- Helpers: parsing HQ frames ----------
function dmToDec(dm, hemi) {
  // dm like "3612.8854" or "08140.0735"
  if (!dm || dm.indexOf('.') === -1) return NaN;
  const i = dm.indexOf('.');
  const degStr = dm.slice(0, i - 2);   // degrees = all but last 2 pre-decimal
  const minStr = dm.slice(i - 2);      // minutes = last 2 pre-decimal + fraction
  const deg = parseInt(degStr, 10);
  const mins = parseFloat(minStr);
  if (!Number.isFinite(deg) || !Number.isFinite(mins)) return NaN;
  let dec = deg + mins / 60;
  if (hemi === 'S' || hemi === 'W') dec = -dec; // W/S make it negative
  return dec;
}

function hqTimestamp(hhmmss, ddmmyy) {
  // Times are UTC; example hhmmss="132707", ddmmyy="110825" -> 2025-08-11T13:27:07Z
  if (!/^\d{6}$/.test(hhmmss) || !/^\d{6}$/.test(ddmmyy)) return new Date().toISOString();
  const hh = hhmmss.slice(0, 2);
  const mm = hhmmss.slice(2, 4);
  const ss = hhmmss.slice(4, 6);
  const dd = ddmmyy.slice(0, 2);
  const MM = ddmmyy.slice(2, 4);
  const yy = ddmmyy.slice(4, 6);
  const iso = `20${yy}-${MM}-${dd}T${hh}:${mm}:${ss}Z`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/**
 * Parse 0..N HQ frames from a raw TCP chunk.
 * Returns an array of {lat, lon, timestamp, rawData, hexData, imei}
 */
function parseSTGPS(raw, hex) {
  const out = [];
  const frames = raw.match(/\*+HQ[^#]+#/g) || [];   // match *HQ or **HQ
  if (frames.length === 0) {
    console.log('🟡 parseSTGPS: no HQ frames found in chunk');
    return out;
  }

  for (const frame of frames) {
    try {
      const cleaned = frame.replace(/^\*+/, '').replace(/#$/, ''); // strip 1+ leading * and trailing #
      const p = cleaned.split(',');

      // Debug the fields when parsing
      console.log('🔎 HQ fields:', p);

      // Expect: HQ,ID,V1,hhmmss,A|V,lat,N/S,lon,E/W,speed,course,ddmmyy,....
      if (p[0] !== 'HQ') {
        console.log('⛔ skip: p[0] !== "HQ" →', p[0]);
        continue;
      }

      const fixFlag = p[4];
      if (fixFlag !== 'A') {
        console.log('⛔ skip: fix flag not A →', fixFlag);
        continue;
      }

      const latStr = p[5], latHem = p[6];
      const lonStr = p[7], lonHem = p[8];
      const dateStr = p[11];   // ddmmyy  ← important: index 11
      const timeStr = p[3];    // hhmmss

      const lat = dmToDec(latStr, latHem);
      const lon = dmToDec(lonStr, lonHem);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        console.log('⛔ skip: non-finite lat/lon →', latStr, latHem, lonStr, lonHem, '=>', lat, lon);
        continue;
      }

      const ts = hqTimestamp(timeStr, dateStr);
      const fix = {
        lat,
        lon,
        timestamp: ts,
        rawData: frame,
        hexData: hex,
        imei: p[1],
      };

      console.log('✅ fix parsed:', fix);
      out.push(fix);
    } catch (e) {
      console.log('💥 parse error on frame:', frame, e.message);
    }
  }

  if (out.length === 0) console.log('🟠 parseSTGPS: no valid fixes produced');
  return out;
}


// ---------- TCP Server ----------
const tcpServer = net.createServer((socket) => {
  stats.connectionsTotal++;
  console.log(`📡 GPS Tracker connected from: ${socket.remoteAddress} (Connection #${stats.connectionsTotal})`);

  // keepalive helps with long idle periods
  socket.setKeepAlive(true, 30_000);

  let connectionPackets = 0;
  const connectionStart = Date.now();

  socket.on('data', (data) => {
    connectionPackets++;
    stats.packetsReceived++;

    const raw = data.toString().trim();
    const hex = data.toString('hex');

    console.log(`📨 Packet #${stats.packetsReceived} from ${socket.remoteAddress}: len=${data.length}`);
    console.log(`  String: "${raw}"`);
    console.log(`  Hex: ${hex}`);

    const fixes = parseSTGPS(raw, hex);

    if (fixes.length > 0) {
      for (const fix of fixes) {
        stats.packetsParsed++;
        console.log(`✅ Parsed: lat=${fix.lat}, lon=${fix.lon}, ts=${fix.timestamp}`);

        // Forward only what you said you want
        forwardToHTTPService({
          lat: fix.lat,
          lon: fix.lon,
          timestamp: fix.timestamp,
          rawData: fix.rawData,
          hexData: fix.hexData,
          source: 'tcp-service',
        });
      }
      socket.write('OK\r\n'); // ack this batch
    } else {
      console.log('⚠️  No valid HQ fix in chunk — forwarding raw for analysis');
      forwardToHTTPService({
        lat: null,
        lon: null,
        timestamp: new Date().toISOString(),
        rawData: raw,
        hexData: hex,
        source: 'tcp-service',
        debug: true,
      });
      socket.write('ACK\r\n');
    }
  });

  socket.on('end', () => {
    const ms = Date.now() - connectionStart;
    console.log(`❌ GPS Tracker ${socket.remoteAddress} disconnected`);
    console.log(`📊 Connection summary: ${connectionPackets} packets in ${ms}ms`);
  });

  socket.on('error', (err) => {
    stats.errors++;
    console.error(`⚠️  TCP socket error from ${socket.remoteAddress}:`, err.message);
  });

  socket.on('close', () => {
    console.log(`🔌 Connection closed: ${socket.remoteAddress}`);
  });
});

// ---------- Forwarder (HTTPS POST to /ping) ----------
function forwardToHTTPService(payload) {
  const postData = JSON.stringify(payload);
  const url = new URL('/ping', HTTP_SERVICE_URL);
  const options = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'User-Agent': 'TCP-GPS-Service/1.0',
    },
    timeout: 5000,
  };

  const req = https.request(options, (res) => {
    stats.packetsForwarded++;
    console.log(`📤 Forwarded to HTTP service - Status: ${res.statusCode}`);
    let body = '';
    res.on('data', (c) => (body += c));
    res.on('end', () => {
      if (res.statusCode >= 400) console.log('📥 HTTP service response:', body);
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

// ---------- Start servers ----------
tcpServer.listen(TCP_PORT, '0.0.0.0', (err) => {
  if (err) {
    console.error('❌ Failed to start TCP server:', err);
    process.exit(1);
  }
  console.log(`🚀 TCP GPS Service listening on port ${TCP_PORT}`);
  console.log(`📡 Configure your ST-915L to: [railway-tcp-domain]:<proxyPort>`);
});

// Health server
const app = express();
const healthPort = parseInt(TCP_PORT) === 7000 ? 7001 : parseInt(TCP_PORT) + 1;

app.get('/health', (_req, res) => {
  res.json({
    status: 'OK',
    service: 'TCP GPS Forwarder',
    tcp_port: TCP_PORT,
    target: HTTP_SERVICE_URL,
    stats,
    timestamp: new Date().toISOString(),
  });
});

app.get('/stats', (_req, res) => res.json(stats));

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
