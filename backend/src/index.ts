import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { config } from './config/env';
import { prisma } from './config/database';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';

const app = express();

// Security headers with basic CSP
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", 'https://margecalc-production.up.railway.app', 'https://api.stripe.com'],
      fontSrc: ["'self'", 'data:'],
      frameSrc: ["'self'", 'https://js.stripe.com'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS — restrict origins in production
const corsOrigin = config.allowedOrigins.includes('*') ? '*' : config.allowedOrigins;
app.use(cors({
  origin: corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Global rate limiter
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, réessayez plus tard' },
}));

// Stricter rate limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Trop de tentatives, réessayez dans 15 minutes' },
});
app.use('/api/auth', authLimiter);

// Smaller JSON limit for general requests; scan endpoints get 10mb below
app.use('/api/subscription/webhook', express.raw({ type: 'application/json' }));
app.use('/api/scan', express.json({ limit: '10mb' }));
app.use(express.json({ limit: '1mb' }));

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

// Health check with DB verification
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected', timestamp: new Date().toISOString() });
  }
});

app.use('/api', routes);

// Serve Expo web build (static files)
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// SPA fallback: any non-API route serves index.html
app.get('*', (_req, res, next) => {
  const indexPath = path.join(publicDir, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) next();
  });
});

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`MargeBar API running on port ${config.port}`);
});

export default app;
