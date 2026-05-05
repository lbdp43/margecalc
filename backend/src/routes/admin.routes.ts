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
function startOfMonthUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonthsUTC(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

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
        bannedAt: true,
      },
      orderBy: [
        { lastSeenAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
    });

    // Current-month + total login counts, in two grouped queries (no per-user round-trip).
    const monthStart = startOfMonthUTC(new Date());
    const [currentMonthRows, totalRows] = await Promise.all([
      prisma.userMonthlyLogin.findMany({
        where: { month: monthStart },
        select: { userId: true, count: true },
      }),
      prisma.userMonthlyLogin.groupBy({
        by: ['userId'],
        _sum: { count: true },
      }),
    ]);
    const currentMonthByUser = new Map(currentMonthRows.map((r) => [r.userId, r.count]));
    const totalByUser = new Map(totalRows.map((r) => [r.userId, r._sum.count ?? 0]));

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
        bannedAt: u.bannedAt?.toISOString() ?? null,
        loginsThisMonth: currentMonthByUser.get(u.id) ?? 0,
        loginsTotal: totalByUser.get(u.id) ?? 0,
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

// GET /api/admin/logins?from=YYYY-MM&to=YYYY-MM
// Aggregated login series across ALL users. Same shape as the per-user
// endpoint but summed; capped at 24 months.
router.get('/logins', async (req: Request, res: Response): Promise<void> => {
  try {
    const parseMonth = (raw: unknown): Date | null => {
      if (typeof raw !== 'string') return null;
      const match = raw.match(/^(\d{4})-(\d{2})$/);
      if (!match) return null;
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      if (month < 1 || month > 12) return null;
      return new Date(Date.UTC(year, month - 1, 1));
    };

    const today = startOfMonthUTC(new Date());
    let from = parseMonth(req.query.from) ?? today;
    let to = parseMonth(req.query.to) ?? today;
    if (from.getTime() > to.getTime()) [from, to] = [to, from];
    const earliest = addMonthsUTC(to, -23);
    if (from.getTime() < earliest.getTime()) from = earliest;

    const rows = await prisma.userMonthlyLogin.groupBy({
      by: ['month'],
      where: { month: { gte: from, lte: to } },
      _sum: { count: true },
      orderBy: { month: 'asc' },
    });

    const byMonthIso = new Map(rows.map((r) => [r.month.toISOString(), r._sum.count ?? 0]));
    const series: { month: string; count: number }[] = [];
    for (let cursor = new Date(from); cursor.getTime() <= to.getTime(); cursor = addMonthsUTC(cursor, 1)) {
      const iso = cursor.toISOString();
      series.push({ month: iso.slice(0, 7), count: byMonthIso.get(iso) ?? 0 });
    }
    const total = series.reduce((sum, s) => sum + s.count, 0);

    // Active users count over the period (any login)
    const activeUsers = await prisma.userMonthlyLogin.findMany({
      where: { month: { gte: from, lte: to }, count: { gt: 0 } },
      select: { userId: true },
      distinct: ['userId'],
    });

    res.json({
      from: from.toISOString().slice(0, 7),
      to: to.toISOString().slice(0, 7),
      total,
      activeUsers: activeUsers.length,
      series,
    });
  } catch (err: any) {
    console.error('Admin global logins error:', err.message);
    res.status(500).json({ error: 'Impossible de charger les connexions' });
  }
});

// GET /api/admin/users/:userId/logins?from=YYYY-MM&to=YYYY-MM
// Returns the monthly login count series for a user.
// Range capped at 24 months. Defaults to the current month only.
router.get('/users/:userId/logins', async (req: Request, res: Response): Promise<void> => {
  try {
    const parseMonth = (raw: unknown): Date | null => {
      if (typeof raw !== 'string') return null;
      const match = raw.match(/^(\d{4})-(\d{2})$/);
      if (!match) return null;
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      if (month < 1 || month > 12) return null;
      return new Date(Date.UTC(year, month - 1, 1));
    };

    const today = startOfMonthUTC(new Date());
    let from = parseMonth(req.query.from) ?? today;
    let to = parseMonth(req.query.to) ?? today;
    if (from.getTime() > to.getTime()) [from, to] = [to, from];

    // Cap range at 24 months
    const earliest = addMonthsUTC(to, -23);
    if (from.getTime() < earliest.getTime()) from = earliest;

    const rows = await prisma.userMonthlyLogin.findMany({
      where: { userId: req.params.userId, month: { gte: from, lte: to } },
      select: { month: true, count: true },
      orderBy: { month: 'asc' },
    });

    // Backfill 0-count months so the series is dense for charting
    const series: { month: string; count: number }[] = [];
    const byMonthIso = new Map(rows.map((r) => [r.month.toISOString(), r.count]));
    for (let cursor = new Date(from); cursor.getTime() <= to.getTime(); cursor = addMonthsUTC(cursor, 1)) {
      const iso = cursor.toISOString();
      const ym = iso.slice(0, 7); // YYYY-MM
      series.push({ month: ym, count: byMonthIso.get(iso) ?? 0 });
    }

    const total = series.reduce((sum, s) => sum + s.count, 0);
    res.json({
      from: from.toISOString().slice(0, 7),
      to: to.toISOString().slice(0, 7),
      total,
      series,
    });
  } catch (err: any) {
    console.error('Admin user logins error:', err.message);
    res.status(500).json({ error: 'Impossible de charger les connexions' });
  }
});

// PATCH /api/admin/users/:userId/ban — ban a user (prevents login)
router.patch('/users/:userId/ban', async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user?.userId === req.params.userId) {
      res.status(400).json({ error: 'Vous ne pouvez pas vous bannir vous-même' });
      return;
    }
    const target = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!target) {
      res.status(404).json({ error: 'Utilisateur introuvable' });
      return;
    }
    if (target.role === 'admin') {
      res.status(400).json({ error: 'Impossible de bannir un administrateur' });
      return;
    }
    const updated = await prisma.user.update({
      where: { id: req.params.userId },
      data: { bannedAt: new Date() },
      select: { id: true, email: true, bannedAt: true },
    });
    res.json({
      id: updated.id,
      email: updated.email,
      bannedAt: updated.bannedAt?.toISOString() ?? null,
    });
  } catch (err: any) {
    console.error('Admin ban user error:', err.message);
    res.status(500).json({ error: 'Impossible de bannir l\'utilisateur' });
  }
});

// PATCH /api/admin/users/:userId/unban — lift the ban
router.patch('/users/:userId/unban', async (req: Request, res: Response): Promise<void> => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!target) {
      res.status(404).json({ error: 'Utilisateur introuvable' });
      return;
    }
    const updated = await prisma.user.update({
      where: { id: req.params.userId },
      data: { bannedAt: null },
      select: { id: true, email: true, bannedAt: true },
    });
    res.json({
      id: updated.id,
      email: updated.email,
      bannedAt: updated.bannedAt?.toISOString() ?? null,
    });
  } catch (err: any) {
    console.error('Admin unban user error:', err.message);
    res.status(500).json({ error: 'Impossible de débannir l\'utilisateur' });
  }
});

// DELETE /api/admin/users/:userId — permanently delete the account + all data
router.delete('/users/:userId', async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user?.userId === req.params.userId) {
      res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
      return;
    }
    const target = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!target) {
      res.status(404).json({ error: 'Utilisateur introuvable' });
      return;
    }
    if (target.role === 'admin') {
      res.status(400).json({ error: 'Impossible de supprimer un administrateur' });
      return;
    }
    // Cascade-delete dependent rows that don't have ON DELETE CASCADE in schema.
    await prisma.$transaction([
      prisma.productServing.deleteMany({ where: { product: { userId: req.params.userId } } }),
      prisma.recipeIngredient.deleteMany({ where: { recipe: { userId: req.params.userId } } }),
      prisma.recipe.deleteMany({ where: { userId: req.params.userId } }),
      prisma.product.deleteMany({ where: { userId: req.params.userId } }),
      prisma.servingType.deleteMany({ where: { userId: req.params.userId } }),
      prisma.customContainer.deleteMany({ where: { userId: req.params.userId } }),
      prisma.scanUsage.deleteMany({ where: { userId: req.params.userId } }),
      prisma.ticket.deleteMany({ where: { userId: req.params.userId } }),
      prisma.user.delete({ where: { id: req.params.userId } }),
    ]);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Admin delete user error:', err.message);
    res.status(500).json({ error: 'Impossible de supprimer l\'utilisateur' });
  }
});

export default router;
