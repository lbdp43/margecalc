import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

const ALLOWED_TYPES = new Set(['bug', 'suggestion', 'question']);
const ALLOWED_STATUSES = new Set(['open', 'resolved']);
const MAX_MESSAGE_LENGTH = 4000;
const MAX_SCREEN_NAME_LENGTH = 100;

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

// GET /api/tickets — list all tickets (admin only)
router.get('/', authenticate, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const tickets = await prisma.ticket.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, email: true, businessName: true },
        },
      },
    });

    res.json(
      tickets.map((t) => ({
        id: t.id,
        type: t.type,
        message: t.message,
        screenName: t.screenName,
        screenshotBase64: t.screenshotBase64,
        status: t.status,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        user: t.user,
      })),
    );
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
