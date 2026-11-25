'use strict';

require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { initDatabase, closeDatabase } = require('./config/db');
const { assertAuthConfig } = require('./auth');
const { MediaController } = require('./controllers/MediaController');
const { attachWebSocket } = require('./controllers/SocketController');
const { wrapController } = require('./utils/asyncHandler');
const { CallModel } = require('./models/CallModel');
const { UploadModel } = require('./models/UploadModel');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const apiRoutes = require('./routes/apiRoutes');

const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT || 3000);

assertAuthConfig(); // production'da JWT_SECRET zaif bo'lsa darhol to'xtaydi
if (isProd && !process.env.CORS_ORIGIN) {
  console.warn('[config] CORS_ORIGIN o‘rnatilmagan: brauzer (web) clientlar bloklanadi. Mobil ilovalarga ta’sir qilmaydi.');
}

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
  : null;

function originAllowed(origin) {
  if (!origin) return true; // mobil/server clientlar Origin yubormaydi
  if (allowedOrigins) return allowedOrigins.includes(origin);
  return !isProd; // dev: ruxsat, production: sozlanmagan bo'lsa rad
}

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) {
  const v = process.env.TRUST_PROXY;
  app.set('trust proxy', /^\d+$/.test(v) ? Number(v) : v === 'true' ? true : v);
}

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (req.path.startsWith('/api')) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  }
  next();
});

app.use(cors({
  origin: (origin, cb) => cb(null, originAllowed(origin)),
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
}));

// Katta (base64) JSON faqat fayl yuklash route'ida; qolganlarida 100 KB
app.use('/api/media', express.json({ limit: '8mb' }));
app.use(express.json({ limit: '100kb' }));

app.get('/uploads/:name', wrapController({ serve: MediaController.serve }).serve);
app.use('/api', apiRoutes);
app.use(notFound);
app.use(errorHandler);

const server = http.createServer(app);
const wss = new WebSocketServer({
  server,
  maxPayload: 64 * 1024,
  verifyClient: ({ origin }) => originAllowed(origin),
});
attachWebSocket(wss);

process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  shutdown(1);
});

let shuttingDown = false;
async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('Server to‘xtatilmoqda...');
  setTimeout(() => process.exit(code || 1), 10000).unref();
  wss.clients.forEach((c) => c.close(1001, 'Server shutting down'));
  server.close(async () => {
    await closeDatabase().catch(() => {});
    process.exit(code);
  });
}
process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));

initDatabase()
  .then(async () => {
    await CallModel.failStale();
    const cleanup = () => UploadModel.cleanupOrphans(MediaController.uploadsDir).catch((e) => console.error('[cleanup]', e.message));
    setInterval(cleanup, 60 * 60 * 1000).unref();
    server.listen(PORT, () => console.log(`PulseLink Server ishga tushdi: port ${PORT} (${isProd ? 'production' : 'development'})`));
  })
  .catch((err) => {
    console.error('Ishga tushirishda xatolik:', err.message);
    process.exit(1);
  });

module.exports = { app };
