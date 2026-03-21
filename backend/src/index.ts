import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config/env';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use('/api/subscription/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({
  limit: '10mb',
  verify: (req: any, _res, buf) => { req.rawBody = buf; },
}));

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
