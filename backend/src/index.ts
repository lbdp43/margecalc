import './utils/validation'; // installs the French Zod error messages before any schema is used
import express, { Request } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import path from 'path';
import { config } from './config/env';
import { prisma } from './config/database';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';

// Safety net: an async route that forgets its try/catch must never take the whole process down
// (Express 4 does not catch rejected promises). Log and keep serving.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

const app = express();

// Railway (and most PaaS) put exactly one reverse proxy in front of the app: trust it so that
// req.ip is the real client IP (rate limits per user/IP instead of one shared proxy bucket).
app.set('trust proxy', 1);

// Security headers with basic CSP.
// Product photos are data: URIs rendered in <img> (img-src data:), fonts are self-hosted
// under /assets (font-src 'self'). The PWA service worker is /sw.js (worker-src 'self') and the
// manifest /manifest.json (manifest-src 'self').
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", 'https://margecalc-production.up.railway.app', 'https://api.stripe.com'],
      fontSrc: ["'self'", 'data:'],
      frameSrc: ["'self'", 'https://js.stripe.com'],
      workerSrc: ["'self'", 'blob:'],
      manifestSrc: ["'self'"],
      // Only meaningful behind HTTPS; on a plain-http local instance it would break assets.
      upgradeInsecureRequests: config.isProd ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS — restrict origins in production
const corsOrigin = config.allowedOrigins.includes('*') ? '*' : config.allowedOrigins;
app.use(cors({
  origin: corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

/** userId of a valid access token (no DB hit, cached per request), used to key the API rate limit per user. */
const RL_USER = Symbol('rateLimitUserId');
function tokenUserId(req: Request): string | null {
  const cached = (req as any)[RL_USER];
  if (cached !== undefined) return cached;
  let uid: string | null = null;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), config.jwtSecret) as { userId?: string; type?: string };
      if (!payload.type || payload.type === 'access') uid = payload.userId ?? null;
    } catch {
      uid = null;
    }
  }
  (req as any)[RL_USER] = uid;
  return uid;
}

// API rate limiter — /api only: static files, fonts and the SPA shell never count.
// Authenticated requests are keyed per user (staff of one bar often share one IP).
const API_WINDOW_MS = 15 * 60 * 1000;
app.use('/api', rateLimit({
  windowMs: API_WINDOW_MS,
  limit: (req) => (tokenUserId(req) ? 1500 : 600),
  keyGenerator: (req) => {
    const uid = tokenUserId(req);
    return uid ? `user:${uid}` : `ip:${ipKeyGenerator(req.ip || '0.0.0.0')}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, réessayez dans quelques minutes.' },
}));

// Brute-force protection on login: only FAILED attempts count.
app.use('/api/auth/login', rateLimit({
  windowMs: API_WINDOW_MS,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives, réessayez dans 15 minutes.' },
}));
// Account creation: EVERY attempt counts (unlimited free accounts per IP would also get
// around the per-user daily scan quota). 10 per hour per IP in production; local dev/test
// tooling registers many accounts from 127.0.0.1, so it gets more (REGISTER_LIMIT_PER_HOUR overrides).
const REGISTER_LIMIT_PER_HOUR = (() => {
  const v = parseInt(process.env.REGISTER_LIMIT_PER_HOUR || '', 10);
  return Number.isFinite(v) && v > 0 ? v : (config.isProd ? 10 : 100);
})();
app.use('/api/auth/register', rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: REGISTER_LIMIT_PER_HOUR,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de créations de compte depuis cette connexion, réessayez plus tard.' },
}));
app.use('/api/auth/refresh', rateLimit({
  windowMs: API_WINDOW_MS,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives, réessayez dans 15 minutes.' },
}));

// JSON body limits. Product photos are ~640 px JPEG data URIs (≤ 300 000 chars), so 2 MB is
// plenty; a bigger body gets 413 { error: 'Photo trop volumineuse' } (see errorHandler).
// Scan (one OCR image, 1280–1600 px) and tickets (screenshot) get bigger limits.
app.use('/api/subscription/webhook', express.raw({ type: 'application/json' }));
app.use('/api/scan', express.json({ limit: '8mb' }));
app.use('/api/tickets', express.json({ limit: '5mb' }));
app.use(express.json({ limit: '2mb' }));

// Health check with DB verification. Registered BEFORE the HTTPS/Host enforcement below: the
// platform healthcheck (railway.json `healthcheckPath`) calls the container over plain HTTP
// with its own Host (healthcheck.railway.app) and must get 200, not a 400/redirect.
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected', timestamp: new Date().toISOString() });
  }
});

// HTTPS enforcement in production — validate Host header to prevent injection
if (config.isProd) {
  const trustedHost = new URL(config.appUrl).host;
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      const host = req.header('host');
      if (!host || host !== trustedHost) {
        return res.status(400).json({ error: 'Invalid request' });
      }
      return res.redirect(`https://${trustedHost}${req.url}`);
    }
    next();
  });
}

app.use('/api', routes);

// Unknown API route: JSON 404 (never the SPA's index.html)
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Route introuvable' });
});

// Serve Expo web build (static files).
// The app shell, the service worker and version.json must always be revalidated: a deploy is
// then picked up at once (the hashed bundles under /_expo/static and /assets never change).
const publicDir = path.join(__dirname, 'public');
const NO_CACHE_FILES = new Set(['index.html', 'sw.js', 'version.json', 'manifest.json']);
app.use(express.static(publicDir, {
  setHeaders: (res, filePath) => {
    const name = path.basename(filePath);
    if (!NO_CACHE_FILES.has(name)) return;
    res.setHeader('Cache-Control', 'no-cache');
    if (name === 'sw.js') res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  },
}));

// SPA fallback: any non-API route serves index.html
app.get('*', (_req, res, next) => {
  const indexPath = path.join(publicDir, 'index.html');
  res.sendFile(indexPath, { headers: { 'Cache-Control': 'no-cache' } }, (err) => {
    if (err) next();
  });
});

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`MargeBar API running on port ${config.port}`);
});

export default app;
