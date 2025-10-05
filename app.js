// app.js  (CommonJS)
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3000;

// --- middleware & static ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- home (serve views/index.html or public/index.html if present) ---
app.get('/', (req, res) => {
  const candidates = [
    path.join(__dirname, 'views', 'index.html'),
    path.join(__dirname, 'public', 'index.html')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return res.sendFile(p);
  }
  res.type('html').send('<h1>Tracker</h1><p>API is up.</p>');
});

// ---------- Helpers ----------
async function ensureVehicle(imei) {
  const key = imei || 'veh-default';
  const found = await prisma.vehicle.findFirst({ where: { imei: key } });
  if (found) return found;
  return prisma.vehicle.create({
    data: { imei: key, name: imei ? `Device ${imei}` : 'Unlabeled Vehicle', type: 'Motorbike' }
  });
}

async function getRideForPing(vehicleId, ts, gapMs = 10 * 60 * 1000) {
  const last = await prisma.ping.findFirst({
    where: { vehicleId },
    orderBy: { ts: 'desc' },
    select: { ts: true, rideId: true }
  });
  if (!last) {
    const ride = await prisma.ride.create({ data: { vehicleId, startedAt: ts } });
    return ride.id;
  }
  const gap = ts.getTime() - last.ts.getTime();
  if (last.rideId && gap < gapMs) return last.rideId;
  const ride = await prisma.ride.create({ data: { vehicleId, startedAt: ts } });
  return ride.id;
}

// ---------- Write: POST /ping ----------
app.post('/ping', async (req, res) => {
  try {
    const { lat, lon, timestamp, imei, speed } = req.body || {};
    if (lat == null || lon == null) {
      // ignore debug/noise payloads (keeps TCP forwarder happy)
      return res.status(200).json({ status: 'ignored' });
    }
    const v = await ensureVehicle(imei);
    const ts = new Date(timestamp || Date.now());
    const rideId = await getRideForPing(v.id, ts);

    const ping = await prisma.ping.create({
      data: {
        vehicleId: v.id,
        rideId,
        ts,
        lat: Number(lat),
        lon: Number(lon),
        speedKph: speed != null ? Number(speed) : null
      }
    });

    res.json({ ok: true, vehicleId: v.id, rideId, pingId: ping.id });
  } catch (err) {
    console.error('POST /ping error', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// ---------- Read: GET /pings (for your maps) ----------
app.get('/pings', async (req, res) => {
  const { vehicleId, limit } = req.query;
  const take = Math.min(parseInt(limit || '500', 10), 5000);
  const where = vehicleId ? { vehicleId } : undefined;
  const pings = await prisma.ping.findMany({ where, orderBy: { ts: 'asc' }, take });
  res.json({
    count: pings.length,
    pings: pings.map(p => ({ lat: p.lat, lon: p.lon, timestamp: p.ts, vehicleId: p.vehicleId }))
  });
});

// ---------- Read: GET /latest ----------
app.get('/latest', async (req, res) => {
  const { vehicleId } = req.query;
  const where = vehicleId ? { vehicleId } : undefined;
  const latest = await prisma.ping.findFirst({ where, orderBy: { ts: 'desc' } });
  if (!latest) return res.json(null);
  res.json({ lat: latest.lat, lon: latest.lon, timestamp: latest.ts, vehicleId: latest.vehicleId });
});

// ---------- Forever mode: all rides as GeoJSON ----------
app.get('/vehicles/:id/forever', async (req, res) => {
  const rides = await prisma.ride.findMany({
    where: { vehicleId: req.params.id },
    orderBy: { startedAt: 'asc' },
    include: { points: { orderBy: { ts: 'asc' }, select: { lat: true, lon: true, ts: true } } }
  });

  const features = rides
    .filter(r => r.points.length)
    .map(r => ({
      type: 'Feature',
      properties: { rideId: r.id, startedAt: r.startedAt, endedAt: r.endedAt },
      geometry: { type: 'LineString', coordinates: r.points.map(p => [p.lon, p.lat]) }
    }));

  res.json({ type: 'FeatureCollection', features });
});

// ---------- Reset (your UI’s reset button) ----------
app.delete('/pings', async (_req, res) => {
  await prisma.ping.deleteMany({});
  await prisma.ride.deleteMany({});
  res.json({ ok: true });
});

// ---------- Health ----------
app.get('/health', async (_req, res) => {
  const count = await prisma.ping.count();
  res.json({ status: 'OK', pings_stored: count, ts: new Date().toISOString() });
});

// ---------- start ----------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP service listening on ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => { await prisma.$disconnect(); process.exit(0); });
process.on('SIGTERM', async () => { await prisma.$disconnect(); process.exit(0); });

