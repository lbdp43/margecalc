import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { config } from './config/env';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';

const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disabled for SPA
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
app.use(express.json({
  limit: '1mb',
  verify: (req: any, _res, buf) => { req.rawBody = buf; },
}));

// HTTPS enforcement in production
if (config.isProd) {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(`https://${req.header('host')}${req.url}`);
    }
    next();
  });
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
