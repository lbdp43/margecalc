import { Router, Request, Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth';
import { analyzeBottleImage, analyzeInvoiceImage } from '../services/scan.service';
import { prisma } from '../config/database';

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

// Daily scan limit per user — persisted in DB
const DAILY_LIMIT = 20;

async function checkDailyLimit(req: Request, res: Response): Promise<boolean> {
  const userId = req.user!.userId;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const count = await prisma.scanUsage.count({
    where: {
      userId,
      scannedAt: { gte: today },
    },
  });

  if (count >= DAILY_LIMIT) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const hoursLeft = Math.ceil((tomorrow.getTime() - Date.now()) / 3_600_000);
    res.status(429).json({
      error: `Limite de ${DAILY_LIMIT} scans par jour atteinte. Réessayez dans ${hoursLeft}h.`,
    });
    return false;
  }

  await prisma.scanUsage.create({
    data: { userId },
  });

  return true;
}

router.use(authenticate);
router.use(scanLimiter);

router.post('/bottle', async (req: Request, res: Response) => {
  try {
    if (!(await checkDailyLimit(req, res))) return;
    const { imageBase64 } = scanSchema.parse(req.body);
    const result = await analyzeBottleImage(imageBase64);
    res.json(result);
  } catch (err: any) {
    if (err.name === 'ZodError') {
      res.status(400).json({ error: err.message });
    } else {
      console.error(`[SCAN] Bottle scan error: ${err.message}`);
      res.status(500).json({ error: 'Erreur lors de l\'analyse de l\'image' });
    }
  }
});

router.post('/invoice', async (req: Request, res: Response) => {
  try {
    if (!(await checkDailyLimit(req, res))) return;
    const { imageBase64 } = scanSchema.parse(req.body);
    const result = await analyzeInvoiceImage(imageBase64);
    res.json(result);
  } catch (err: any) {
    if (err.name === 'ZodError') {
      res.status(400).json({ error: err.message });
    } else {
      console.error(`[SCAN] Invoice scan error: ${err.message}`);
      res.status(500).json({ error: 'Erreur lors de l\'analyse de la facture' });
    }
  }
});

export default router;
