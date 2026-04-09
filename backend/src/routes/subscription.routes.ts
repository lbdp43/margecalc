import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { prisma } from '../config/database';
import { config } from '../config/env';
import { authenticate } from '../middleware/auth';

const router = Router();

// Client access codes — grant free access for a limited time to specific clients.
// Keys must be already normalized (see normalizeAccessCode below).
interface AccessCode {
  clientName: string;
  durationDays: number;
}

const ACCESS_CODES: Record<string, AccessCode> = {
  'brasserie des plantes deux mille quinze': {
    clientName: 'Brasserie des Plantes',
    durationDays: 30,
  },
  'brasserie des plantes 2015': {
    clientName: 'Brasserie des Plantes',
    durationDays: 30,
  },
};

function normalizeAccessCode(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, ' ') // non-alphanumeric -> space
    .trim()
    .replace(/\s+/g, ' '); // collapse multiple spaces
}

function getStripe() {
  if (!config.stripeSecretKey) {
    throw new Error('Stripe is not configured');
  }
  return new Stripe(config.stripeSecretKey);
}

// Create or retrieve Stripe customer for a user
async function getOrCreateCustomer(userId: string): Promise<string> {
  const stripe = getStripe();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const customer = await stripe.customers.create({
    email: user.email,
    metadata: { userId: user.id },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}

// GET /api/subscription/status — get current subscription info
router.get('/status', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.userId },
      select: {
        subscriptionStatus: true,
        subscriptionPlan: true,
        subscriptionEndDate: true,
      },
    });
    res.json(user);
  } catch (err: any) {
    res.status(500).json({ error: 'Impossible de récupérer le statut' });
  }
});

// POST /api/subscription/redeem-code — redeem a client access code for free access
router.post('/redeem-code', authenticate, async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    if (typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({ error: 'Code manquant' });
    }

    const normalized = normalizeAccessCode(code);
    const access = ACCESS_CODES[normalized];

    if (!access) {
      return res.status(404).json({ error: 'Code invalide' });
    }

    const now = new Date();
    const currentUser = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.userId },
    });

    // If the user already has an active subscription ending in the future,
    // extend it from that date; otherwise start from now.
    const baseDate =
      currentUser.subscriptionEndDate && currentUser.subscriptionEndDate > now
        ? currentUser.subscriptionEndDate
        : now;
    const endDate = new Date(
      baseDate.getTime() + access.durationDays * 24 * 60 * 60 * 1000,
    );

    const updated = await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        subscriptionStatus: 'active',
        subscriptionPlan: 'access_code',
        subscriptionEndDate: endDate,
      },
    });

    res.json({
      subscriptionStatus: updated.subscriptionStatus,
      subscriptionPlan: updated.subscriptionPlan,
      subscriptionEndDate: updated.subscriptionEndDate?.toISOString() ?? null,
      clientName: access.clientName,
      durationDays: access.durationDays,
    });
  } catch (err: any) {
    console.error('Access code redemption error:', err.message);
    res.status(500).json({ error: 'Impossible de valider le code' });
  }
});

// POST /api/subscription/checkout — create a Stripe Checkout session
router.post('/checkout', authenticate, async (req: Request, res: Response) => {
  try {
    const stripe = getStripe();
    const { plan } = req.body; // 'monthly' or 'yearly'
    const priceId = plan === 'yearly' ? config.stripePriceYearly : config.stripePriceMonthly;

    if (!priceId) {
      return res.status(400).json({ error: 'Plan invalide ou non configuré' });
    }

    const customerId = await getOrCreateCustomer(req.user!.userId);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${config.appUrl}?subscription=success`,
      cancel_url: `${config.appUrl}?subscription=cancel`,
      metadata: { userId: req.user!.userId },
    });

    res.json({ url: session.url });
  } catch (err: any) {
    console.error('Stripe checkout error:', err.message);
    res.status(500).json({ error: 'Impossible de créer la session de paiement' });
  }
});

// POST /api/subscription/portal — create a Stripe Customer Portal session
router.post('/portal', authenticate, async (req: Request, res: Response) => {
  try {
    const stripe = getStripe();
    const customerId = await getOrCreateCustomer(req.user!.userId);

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${config.appUrl}/settings`,
    });

    res.json({ url: session.url });
  } catch (err: any) {
    console.error('Stripe portal error:', err.message);
    res.status(500).json({ error: 'Impossible d\'ouvrir le portail' });
  }
});

// POST /api/subscription/webhook — Stripe webhook handler
router.post('/webhook', async (req: Request, res: Response) => {
  const stripe = getStripe();
  const sig = req.headers['stripe-signature'] as string;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body, // Buffer from express.raw() middleware
      sig,
      config.stripeWebhookSecret,
    );
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Signature invalide' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.userId && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(
            session.subscription as string,
          );
          const periodEnd = (sub as any).current_period_end;
          await prisma.user.update({
            where: { id: session.metadata.userId },
            data: {
              stripeCustomerId: session.customer as string,
              subscriptionStatus: 'active',
              subscriptionPlan: sub.items.data[0]?.price?.lookup_key || 'pro',
              subscriptionEndDate: periodEnd ? new Date(periodEnd * 1000) : null,
            },
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const updatedSub = event.data.object as Stripe.Subscription;
        const customerId = updatedSub.customer as string;
        const existingUser = await prisma.user.findUnique({
          where: { stripeCustomerId: customerId },
        });
        if (existingUser) {
          const endTs = (updatedSub as any).current_period_end;
          await prisma.user.update({
            where: { id: existingUser.id },
            data: {
              subscriptionStatus: updatedSub.status === 'active' ? 'active'
                : updatedSub.status === 'trialing' ? 'trialing'
                : updatedSub.status === 'past_due' ? 'past_due'
                : 'canceled',
              subscriptionEndDate: endTs ? new Date(endTs * 1000) : null,
            },
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        await prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            subscriptionStatus: 'canceled',
            subscriptionEndDate: new Date(),
          },
        });
        break;
      }
    }
  } catch (err: any) {
    console.error('Webhook processing error:', err.message);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }

  res.json({ received: true });
});

export default router;
