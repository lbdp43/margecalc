import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

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

    res.json({
      stats,
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

export default router;
