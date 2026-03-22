import { Router, Request, Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth';
import { analyzeBottleImage, analyzeInvoiceImage } from '../services/scan.service';

const router = Router();

const scanSchema = z.object({
  imageBase64: z.string().min(1000, 'Image trop petite').max(15_000_000, 'Image trop volumineuse'),
});

// Per-minute rate limit (burst protection)
const scanLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Trop de scans, réessayez dans 1 minute' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Daily scan limit per user (cost protection: max 20 scans/day)
const DAILY_LIMIT = 20;
const dailyUsage = new Map<string, { count: number; resetAt: number }>();

function checkDailyLimit(req: Request, res: Response): boolean {
  const userId = req.user!.userId;
  const now = Date.now();
  let usage = dailyUsage.get(userId);

  if (!usage || now >= usage.resetAt) {
    // Reset at midnight or first use
    const tomorrow = new Date();
    tomorrow.setHours(24, 0, 0, 0);
    usage = { count: 0, resetAt: tomorrow.getTime() };
    dailyUsage.set(userId, usage);
  }

  if (usage.count >= DAILY_LIMIT) {
    const hoursLeft = Math.ceil((usage.resetAt - now) / 3_600_000);
    res.status(429).json({
      error: `Limite de ${DAILY_LIMIT} scans par jour atteinte. Réessayez dans ${hoursLeft}h.`,
    });
    return false;
  }

  usage.count++;
  return true;
}

// Cleanup stale entries every hour
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of dailyUsage) {
    if (now >= val.resetAt) dailyUsage.delete(key);
  }
}, 3_600_000);

router.use(authenticate);
router.use(scanLimiter);

router.post('/bottle', async (req: Request, res: Response) => {
  if (!checkDailyLimit(req, res)) return;
  try {
    const { imageBase64 } = scanSchema.parse(req.body);
    const result = await analyzeBottleImage(imageBase64);
    res.json(result);
  } catch (err: any) {
    if (err.name === 'ZodError') {
      res.status(400).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Erreur lors de l\'analyse de l\'image' });
    }
  }
});

router.post('/invoice', async (req: Request, res: Response) => {
  if (!checkDailyLimit(req, res)) return;
  try {
    const { imageBase64 } = scanSchema.parse(req.body);
    const result = await analyzeInvoiceImage(imageBase64);
    res.json(result);
  } catch (err: any) {
    if (err.name === 'ZodError') {
      res.status(400).json({ error: err.message });
    } else {
      res.status(500).json({ error: 'Erreur lors de l\'analyse de la facture' });
    }
  }
});

export default router;
