import express from 'express';
import cors from 'cors';
import { config } from './config/env';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', routes);

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`MargeBar API running on port ${config.port}`);
});

export default app;
