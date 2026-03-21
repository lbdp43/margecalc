import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { analyzeBottleImage } from '../services/scan.service';

const router = Router();

const scanSchema = z.object({
  imageBase64: z.string().min(100, 'Image requise'),
});

router.use(authenticate);

router.post('/bottle', async (req: Request, res: Response) => {
  try {
    const { imageBase64 } = scanSchema.parse(req.body);
    console.log(`[SCAN] Requête reçue, taille image: ${Math.round(imageBase64.length / 1024)}KB`);
    const result = await analyzeBottleImage(imageBase64);
    console.log(`[SCAN] Résultat: ${result.name} (confiance: ${result.confidence})`);
    res.json(result);
  } catch (err: any) {
    console.error('[SCAN] Erreur:', err.message);
    const status = err.name === 'ZodError' ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

export default router;
