import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

router.post('/redeem', authenticate, async (req: Request, res: Response) => {
  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    res.status(400).json({ error: 'Code requis' });
    return;
  }
  try {
    const promo = await prisma.promoCode.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (!promo) { res.status(404).json({ error: 'Code invalide' }); return; }
    if (promo.expiresAt && promo.expiresAt < new Date()) { res.status(400).json({ error: 'Ce code a expire' }); return; }
    if (promo.currentUses >= promo.maxUses) { res.status(400).json({ error: 'Ce code a deja ete utilise le nombre maximum de fois' }); return; }
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + promo.durationDays);
    await prisma.user.update({ where: { id: req.user!.userId }, data: { subscriptionStatus: 'active', subscriptionPlan: `promo_${promo.durationDays}d`, subscriptionEndDate: endDate } });
    await prisma.promoCode.update({ where: { id: promo.id }, data: { currentUses: promo.currentUses + 1 } });
    res.json({ success: true, message: `Code active ! Acces gratuit pendant ${promo.durationDays} jours.`, subscriptionEndDate: endDate.toISOString() });
  } catch (err) {
    console.error('[PROMO] Error redeeming:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', authenticate, requireAdmin, async (req: Request, res: Response) => {
  const { code, durationDays = 30, maxUses = 1, expiresAt } = req.body;
  if (!code || typeof code !== 'string') { res.status(400).json({ error: 'Code requis' }); return; }
  try {
    const promo = await prisma.promoCode.create({ data: { code: code.trim().toUpperCase(), durationDays, maxUses, expiresAt: expiresAt ? new Date(expiresAt) : null } });
    res.json(promo);
  } catch (err: any) {
    if (err?.code === 'P2002') { res.status(400).json({ error: 'Ce code existe deja' }); return; }
    console.error('[PROMO] Error creating:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/', authenticate, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const promos = await prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(promos);
  } catch (err) {
    console.error('[PROMO] Error listing:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    await prisma.promoCode.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch { res.status(404).json({ error: 'Code non trouve' }); }
});

export default router;
