const net = require('net');
const { gpsPings } = require('./routes/index');

const TCP_PORT = 9000; // Use Railway TCP proxy port here

const tcpServer = net.createServer((socket) => {
  console.log('📡 Tracker connected:', socket.remoteAddress);

  socket.on('data', (data) => {
    const raw = data.toString().trim();
    console.log('📨 Raw data received:', raw);

    // Optional: Parse the data (if you understand the format)
    // Example parser: look for "+RESP:" or comma-delimited GPS strings

    // Dummy parsed ping for now
    const ping = {
      lat: 35.0,
      lon: -81.0,
      timestamp: new Date().toISOString(),
      imei: 'from-tcp'
    };

    gpsPings.push(ping);
    console.log('✅ Parsed and stored ping:', ping);
  });

  socket.on('end', () => {
    console.log('❌ Tracker disconnected');
  });

  socket.on('error', (err) => {
    console.error('⚠️ TCP error:', err.message);
  });
});

tcpServer.listen(TCP_PORT, () => {
  console.log(`🚀 TCP server listening on port ${TCP_PORT}`);
});
