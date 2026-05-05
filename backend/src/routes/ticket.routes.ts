import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

const ALLOWED_TYPES = new Set(['bug', 'suggestion', 'question']);
const ALLOWED_STATUSES = new Set(['open', 'resolved']);
const MAX_MESSAGE_LENGTH = 4000;
const MAX_REPLY_LENGTH = 4000;
const MAX_SCREEN_NAME_LENGTH = 100;

// Shared select clause — excludes screenshotBase64 from list queries to avoid
// sending megabytes of base64 data just to render a list or count unread badges.
const TICKET_LIST_SELECT = {
  id: true,
  userId: true,
  type: true,
  message: true,
  screenName: true,
  screenshotBase64: false,
  status: true,
  adminReply: true,
  repliedAt: true,
  readByUser: true,
  createdAt: true,
  updatedAt: true,
} as const;

function serializeTicket(t: {
  id: string; type: string; message: string; screenName: string | null;
  screenshotBase64?: string | null; status: string; adminReply?: string | null;
  repliedAt?: Date | null; readByUser?: boolean; createdAt: Date; updatedAt: Date;
  user?: { id: string; email: string; businessName: string | null };
}) {
  return {
    id: t.id,
    type: t.type,
    message: t.message,
    screenName: t.screenName,
    hasScreenshot: !!t.screenshotBase64,
    screenshotBase64: t.screenshotBase64 ?? null,
    status: t.status,
    adminReply: t.adminReply ?? null,
    repliedAt: t.repliedAt?.toISOString?.() || null,
    readByUser: t.readByUser ?? true,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    ...(t.user ? { user: t.user } : {}),
  };
}

// POST /api/tickets — create a feedback ticket (any authenticated user)
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { type, message, screenName, screenshotBase64 } = req.body;

    if (typeof type !== 'string' || !ALLOWED_TYPES.has(type)) {
      return res.status(400).json({ error: 'Type invalide' });
    }
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message requis' });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: 'Message trop long' });
    }
    if (screenName != null && (typeof screenName !== 'string' || screenName.length > MAX_SCREEN_NAME_LENGTH)) {
      return res.status(400).json({ error: "Nom d'ecran invalide" });
    }
    if (screenshotBase64 != null && typeof screenshotBase64 !== 'string') {
      return res.status(400).json({ error: 'Capture invalide' });
    }

    const ticket = await prisma.ticket.create({
      data: {
        userId: req.user!.userId,
        type,
        message: message.trim(),
        screenName: screenName || null,
        screenshotBase64: screenshotBase64 || null,
      },
    });

    res.json({
      id: ticket.id,
      type: ticket.type,
      status: ticket.status,
      createdAt: ticket.createdAt.toISOString(),
    });
  } catch (err: any) {
    console.error('Create ticket error:', err.message);
    res.status(500).json({ error: 'Impossible de creer le ticket' });
  }
});

// GET /api/tickets/mine/unread-count — lightweight badge count
router.get('/mine/unread-count', authenticate, async (req: Request, res: Response) => {
  try {
    const count = await prisma.ticket.count({
      where: {
        userId: req.user!.userId,
        adminReply: { not: null },
        readByUser: false,
      },
    });
    res.json({ count });
  } catch (err: any) {
    console.error('Unread count error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/tickets/mine — list the authenticated user's own tickets (no screenshots)
router.get('/mine', authenticate, async (req: Request, res: Response) => {
  try {
    const tickets = await prisma.ticket.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      select: TICKET_LIST_SELECT,
    });

    res.json(tickets.map((t) => serializeTicket(t as any)));
  } catch (err: any) {
    console.error('List own tickets error:', err.message);
    res.status(500).json({ error: 'Impossible de lister vos tickets' });
  }
});

// GET /api/tickets/:id/screenshot — load screenshot on demand
router.get('/:id/screenshot', authenticate, async (req: Request, res: Response) => {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.id },
      select: { userId: true, screenshotBase64: true },
    });
    if (!ticket) return res.status(404).json({ error: 'Ticket introuvable' });
    const isOwner = ticket.userId === req.user!.userId;
    const isAdmin = req.user!.role === 'admin';
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Acces refuse' });
    res.json({ screenshotBase64: ticket.screenshotBase64 });
  } catch (err: any) {
    console.error('Load screenshot error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/tickets/:id/read — mark a ticket as read by its owner
router.patch('/:id/read', authenticate, async (req: Request, res: Response) => {
  try {
    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!ticket || ticket.userId !== req.user!.userId) {
      return res.status(404).json({ error: 'Ticket introuvable' });
    }
    const updated = await prisma.ticket.update({
      where: { id: req.params.id },
      data: { readByUser: true },
    });
    res.json({ id: updated.id, readByUser: updated.readByUser });
  } catch (err: any) {
    console.error('Mark ticket read error:', err.message);
    res.status(500).json({ error: 'Impossible de marquer le ticket' });
  }
});

// PATCH /api/tickets/:id/reply — post or edit the admin reply (admin only)
router.patch('/:id/reply', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { reply } = req.body;
    if (typeof reply !== 'string' || !reply.trim()) {
      return res.status(400).json({ error: 'Reponse requise' });
    }
    if (reply.length > MAX_REPLY_LENGTH) {
      return res.status(400).json({ error: 'Reponse trop longue' });
    }

    const updated = await prisma.ticket.update({
      where: { id: req.params.id },
      data: {
        adminReply: reply.trim(),
        repliedAt: new Date(),
        readByUser: false,
      },
    });

    res.json({
      id: updated.id,
      adminReply: updated.adminReply,
      repliedAt: updated.repliedAt?.toISOString() || null,
      readByUser: updated.readByUser,
    });
  } catch (err: any) {
    console.error('Reply ticket error:', err.message);
    res.status(500).json({ error: 'Impossible de publier la reponse' });
  }
});

// GET /api/tickets — list all tickets (admin only, no screenshots)
router.get('/', authenticate, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const tickets = await prisma.ticket.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        ...TICKET_LIST_SELECT,
        user: {
          select: { id: true, email: true, businessName: true },
        },
      },
    });

    res.json(tickets.map((t) => serializeTicket(t as any)));
  } catch (err: any) {
    console.error('List tickets error:', err.message);
    res.status(500).json({ error: 'Impossible de lister les tickets' });
  }
});

// PATCH /api/tickets/:id — update ticket status (admin only)
router.patch('/:id', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    if (typeof status !== 'string' || !ALLOWED_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Statut invalide' });
    }

    const updated = await prisma.ticket.update({
      where: { id: req.params.id },
      data: { status },
    });

    res.json({ id: updated.id, status: updated.status });
  } catch (err: any) {
    console.error('Update ticket error:', err.message);
    res.status(500).json({ error: 'Impossible de mettre a jour le ticket' });
  }
});

// DELETE /api/tickets/:id — delete a ticket (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    await prisma.ticket.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err: any) {
    console.error('Delete ticket error:', err.message);
    res.status(500).json({ error: 'Impossible de supprimer le ticket' });
  }
});

export default router;
