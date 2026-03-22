import { Router, Request, Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth';
import { analyzeBottleImage, analyzeInvoiceImage } from '../services/scan.service';

const router = Router();

const scanSchema = z.object({
  imageBase64: z.string().min(1000, 'Image trop petite').max(15_000_000, 'Image trop volumineuse'),
});

// Strict rate limit on scan endpoints (expensive external API calls)
const scanLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: { error: 'Trop de scans, réessayez dans 1 minute' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(authenticate);
router.use(scanLimiter);

router.post('/bottle', async (req: Request, res: Response) => {
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
