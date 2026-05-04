import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

// GET /api/rates — any authenticated user can read (also allow unauthenticated for landing page)
router.get('/', async (_req: Request, res: Response) => {
  try {
    const rates = await prisma.rate.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    const formatted = rates.map((r) => ({
      id: r.id,
      slug: r.slug,
      label: r.label,
      examples: r.examples,
      calcType: r.calcType,
      acciseRate: r.acciseRate,
      acciseUnit: r.acciseUnit,
      cotisationRate: r.cotisationRate,
      cotisationUnit: r.cotisationUnit,
      cotisationCond: r.cotisationCond,
      sortOrder: r.sortOrder,
      updatedAt: r.updatedAt.toISOString(),
    }));
    res.json(formatted);
  } catch (err) {
    console.error('[RATES] Error fetching:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/rates/:slug — admin only, update accise and cotisation rates
router.put('/:slug', authenticate, requireAdmin, async (req: Request, res: Response) => {
  const { slug } = req.params;
  const { acciseRate, cotisationRate } = req.body;

  try {
    const data: any = {};
    if (acciseRate !== undefined) data.acciseRate = parseFloat(acciseRate);
    if (cotisationRate !== undefined) data.cotisationRate = parseFloat(cotisationRate);

    const rate = await prisma.rate.update({
      where: { slug },
      data,
    });
    res.json({
      id: rate.id,
      slug: rate.slug,
      label: rate.label,
      examples: rate.examples,
      calcType: rate.calcType,
      acciseRate: rate.acciseRate,
      acciseUnit: rate.acciseUnit,
      cotisationRate: rate.cotisationRate,
      cotisationUnit: rate.cotisationUnit,
      cotisationCond: rate.cotisationCond,
      sortOrder: rate.sortOrder,
      updatedAt: rate.updatedAt.toISOString(),
    });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      res.status(404).json({ error: `Categorie "${slug}" non trouvee` });
      return;
    }
    console.error('[RATES] Error updating:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/rates/reset — admin only, reset all rates to 2026 defaults
router.put('/reset/defaults', authenticate, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const defaults: Record<string, { accise: number; cotisation: number }> = {
      vin_tranquille: { accise: 4.19, cotisation: 0 },
      vin_mousseux: { accise: 10.38, cotisation: 0 },
      cidre_poire: { accise: 1.46, cotisation: 0 },
      boisson_fermentee: { accise: 4.19, cotisation: 0 },
      prod_interm_vdl_vdn: { accise: 52.39, cotisation: 20.97 },
      prod_interm_autre: { accise: 209.53, cotisation: 52.39 },
      biere_legere: { accise: 4.12, cotisation: 52.39 },
      biere: { accise: 8.24, cotisation: 52.39 },
      petite_brasserie: { accise: 4.12, cotisation: 52.39 },
      rhum_dom: { accise: 966.75, cotisation: 620.47 },
      liqueur: { accise: 1932.42, cotisation: 620.47 },
      spiritueux: { accise: 1932.42, cotisation: 620.47 },
      rhum_hors_dom: { accise: 1932.42, cotisation: 620.47 },
    };

    for (const [slug, values] of Object.entries(defaults)) {
      await prisma.rate.updateMany({
        where: { slug },
        data: { acciseRate: values.accise, cotisationRate: values.cotisation },
      });
    }

    // Reset year
    await prisma.systemParam.updateMany({
      where: { key: 'tarif_annee' },
      data: { value: '2026' },
    });

    const rates = await prisma.rate.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json(rates);
  } catch (err) {
    console.error('[RATES] Error resetting:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
