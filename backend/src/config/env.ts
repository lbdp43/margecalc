import dotenv from 'dotenv';
dotenv.config();

const isProd = process.env.NODE_ENV === 'production';
// Only an EXPLICIT development/test run may start without a real JWT_SECRET. A server started
// without NODE_ENV (e.g. a PaaS where the variable was forgotten) is validated like production:
// otherwise a missing JWT_SECRET would silently fall back to a public default and allow forged tokens.
const isDev = (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test')
  && !process.env.RAILWAY_ENVIRONMENT;

if (!isProd && !isDev) {
  console.warn('WARNING: NODE_ENV is not "production": HTTPS redirect, CORS lock and production rate limits are OFF. Set NODE_ENV=production on the server.');
}

// Validate critical environment variables
if (!isDev) {
  const required: Record<string, string | undefined> = {
    JWT_SECRET: process.env.JWT_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
  };
  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(`FATAL: Missing required environment variables: ${missing.join(', ')}`);
  }
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    throw new Error('FATAL: JWT_SECRET must be at least 32 characters long');
  }
}

if (isProd) {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('WARNING: STRIPE_SECRET_KEY is not set — payment features will be disabled');
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.warn('WARNING: STRIPE_WEBHOOK_SECRET is not set — webhooks will fail');
  }
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  // The fallback is only reachable in an explicit development/test run (validated above otherwise).
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  databaseUrl: process.env.DATABASE_URL || '',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  stripePriceMonthly: process.env.STRIPE_PRICE_MONTHLY || '',
  stripePriceYearly: process.env.STRIPE_PRICE_YEARLY || '',
  appUrl: process.env.APP_URL || 'https://margecalc-production.up.railway.app',
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || (isProd
    ? ['https://margecalc-production.up.railway.app']
    : ['*']),
  isProd,
};
