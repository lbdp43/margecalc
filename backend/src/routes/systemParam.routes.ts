import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

// GET /api/system-params — any authenticated user can read
router.get('/', authenticate, async (_req: Request, res: Response) => {
  try {
    const params = await prisma.systemParam.findMany({
      orderBy: { key: 'asc' },
    });
    const formatted = params.map((p) => ({
      id: p.id,
      key: p.key,
      value: p.value,
      label: p.label,
      unit: p.unit,
      description: p.description,
      updatedAt: p.updatedAt.toISOString(),
    }));
    res.json(formatted);
  } catch (err) {
    console.error('[SYSTEM_PARAMS] Error fetching:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/system-params/:key — admin only
router.put('/:key', authenticate, requireAdmin, async (req: Request, res: Response) => {
  const { key } = req.params;
  const { value } = req.body;

  if (value === undefined || value === null) {
    res.status(400).json({ error: 'La valeur est requise' });
    return;
  }

  try {
    const param = await prisma.systemParam.update({
      where: { key },
      data: { value: String(value) },
    });
    res.json({
      id: param.id,
      key: param.key,
      value: param.value,
      label: param.label,
      unit: param.unit,
      description: param.description,
      updatedAt: param.updatedAt.toISOString(),
    });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ error: `Paramètre "${key}" non trouvé` });
      return;
    }
    console.error('[SYSTEM_PARAMS] Error updating:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
