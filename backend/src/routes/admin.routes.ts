import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { authenticate, requireAdmin } from '../middleware/auth';
import { calculateMargin, MarginMode } from '@margebar/shared';

const router = Router();

// Subscription pricing (TTC). Kept in sync with the SubscriptionScreen display.
const PRICE_MONTHLY_TTC = 3;
const PRICE_YEARLY_TTC = 30;
const VAT_RATE = 0.20;

router.use(authenticate, requireAdmin);

// GET /api/admin/users — list all users with basic stats (admin only).
// Returns only account-level metadata (email, business name, subscription,
// dates) — no products, no recipes, no content.
router.get('/users', async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        businessName: true,
        role: true,
        subscriptionStatus: true,
        subscriptionPlan: true,
        subscriptionEndDate: true,
        createdAt: true,
        lastSeenAt: true,
      },
      orderBy: [
        { lastSeenAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
    });

    const stats = {
      total: users.length,
      active: users.filter((u) => u.subscriptionStatus === 'active').length,
      trialing: users.filter((u) => u.subscriptionStatus === 'trialing').length,
      none: users.filter((u) => u.subscriptionStatus === 'none').length,
      canceled: users.filter((u) => u.subscriptionStatus === 'canceled').length,
      pastDue: users.filter((u) => u.subscriptionStatus === 'past_due').length,
      admins: users.filter((u) => u.role === 'admin').length,
    };

    // Revenue — only paying subscribers (active status, paid plans only).
    // Access-code redemptions are stored as 'trialing' so they're naturally excluded.
    const paid = users.filter(
      (u) =>
        u.subscriptionStatus === 'active' &&
        u.subscriptionPlan !== null &&
        u.subscriptionPlan !== 'access_code',
    );
    const yearlyCount = paid.filter((u) => u.subscriptionPlan === 'pro_yearly').length;
    const monthlyCount = paid.length - yearlyCount;

    const mrrTTC = monthlyCount * PRICE_MONTHLY_TTC + yearlyCount * (PRICE_YEARLY_TTC / 12);
    const arrTTC = monthlyCount * PRICE_MONTHLY_TTC * 12 + yearlyCount * PRICE_YEARLY_TTC;
    const mrrHT = mrrTTC / (1 + VAT_RATE);
    const arrHT = arrTTC / (1 + VAT_RATE);

    const revenue = {
      paidSubscribers: paid.length,
      monthlyCount,
      yearlyCount,
      mrrTTC: Math.round(mrrTTC * 100) / 100,
      mrrHT: Math.round(mrrHT * 100) / 100,
      arrTTC: Math.round(arrTTC * 100) / 100,
      arrHT: Math.round(arrHT * 100) / 100,
      vatRate: VAT_RATE,
    };

    res.json({
      stats,
      revenue,
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        businessName: u.businessName,
        role: u.role,
        subscriptionStatus: u.subscriptionStatus,
        subscriptionPlan: u.subscriptionPlan,
        subscriptionEndDate: u.subscriptionEndDate?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
        lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
      })),
    });
  } catch (err: any) {
    console.error('Admin users list error:', err.message);
    res.status(500).json({ error: 'Impossible de lister les utilisateurs' });
  }
});

// GET /api/admin/products — list ALL products from ALL users with margins
router.get('/products', async (_req: Request, res: Response) => {
  try {
    const products = await prisma.product.findMany({
      include: {
        category: true,
        user: { select: { id: true, email: true, businessName: true } },
        servings: { include: { servingType: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const enriched = products.map((p) => {
      const computed = calculateMargin({
        purchasePriceHT: p.purchasePriceHT,
        containerVolumeCl: p.containerVolumeCl,
        doseVolumeCl: p.doseVolumeCl,
        marginMode: p.marginMode as MarginMode,
        sellingPriceTTC: p.sellingPriceTTC ?? undefined,
        targetMarginPercent: p.targetMarginPercent ?? undefined,
        coefficient: p.coefficient ?? undefined,
        tvaRate: p.tvaRate,
      });

      return {
        id: p.id,
        name: p.name,
        category: p.category.name,
        user: p.user,
        purchasePriceHT: p.purchasePriceHT,
        containerVolumeCl: p.containerVolumeCl,
        tvaRate: p.tvaRate,
        alcoholDegree: p.alcoholDegree,
        supplier: p.supplier,
        marginPercent: computed.marginPercent,
        sellingPriceTTC: computed.sellingPriceTTC,
        coefficient: computed.coefficient,
        servings: p.servings.map((s) => ({
          name: s.servingType.name,
          volumeCl: s.servingType.volumeCl,
          sellingPriceTTC: s.sellingPriceTTC,
        })),
        updatedAt: p.updatedAt.toISOString(),
      };
    });

    res.json(enriched);
  } catch (err: any) {
    console.error('Admin all products error:', err.message);
    res.status(500).json({ error: 'Impossible de charger les produits' });
  }
});

// GET /api/admin/users/:userId/products — list a user's products with margins
router.get('/users/:userId/products', async (req: Request, res: Response) => {
  try {
    const products = await prisma.product.findMany({
      where: { userId: req.params.userId },
      include: {
        category: true,
        servings: { include: { servingType: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const enriched = products.map((p) => {
      const computed = calculateMargin({
        purchasePriceHT: p.purchasePriceHT,
        containerVolumeCl: p.containerVolumeCl,
        doseVolumeCl: p.doseVolumeCl,
        marginMode: p.marginMode as MarginMode,
        sellingPriceTTC: p.sellingPriceTTC ?? undefined,
        targetMarginPercent: p.targetMarginPercent ?? undefined,
        coefficient: p.coefficient ?? undefined,
        tvaRate: p.tvaRate,
      });

      return {
        id: p.id,
        name: p.name,
        category: p.category.name,
        purchasePriceHT: p.purchasePriceHT,
        containerVolumeCl: p.containerVolumeCl,
        tvaRate: p.tvaRate,
        alcoholDegree: p.alcoholDegree,
        supplier: p.supplier,
        marginPercent: computed.marginPercent,
        sellingPriceTTC: computed.sellingPriceTTC,
        coefficient: computed.coefficient,
        servings: p.servings.map((s) => ({
          name: s.servingType.name,
          volumeCl: s.servingType.volumeCl,
          sellingPriceTTC: s.sellingPriceTTC,
        })),
        updatedAt: p.updatedAt.toISOString(),
      };
    });

    res.json(enriched);
  } catch (err: any) {
    console.error('Admin user products error:', err.message);
    res.status(500).json({ error: 'Impossible de charger les produits' });
  }
});

export default router;
