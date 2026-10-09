import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Reads all runtime settings from the environment in one place. */
export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const jwtSecret = env.JWT_SECRET || 'dev-only-secret-change-me';
  if (nodeEnv === 'production' && !env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be set in production');
  }
  const publicUrl = (env.PUBLIC_URL || 'http://localhost:5000').replace(/\/$/, '');
  return {
    nodeEnv,
    port: Number(env.PORT || 5000),
    jwtSecret,
    dbFile: env.DB_FILE || path.join(here, '..', 'data', 'store.db'),
    publicUrl,
    storeName: env.STORE_NAME || 'Axle & Co.',
    currency: env.CURRENCY || 'INR',
    locale: env.LOCALE || 'en-IN',
    taxRate: Number(env.TAX_RATE ?? 0.18),
    // All money values are integers in the smallest unit (paise/cents).
    freeShippingOverCents: Number(env.FREE_SHIPPING_OVER_CENTS ?? 200000),
    shippingStandardCents: Number(env.SHIPPING_STANDARD_CENTS ?? 9900),
    shippingExpressCents: Number(env.SHIPPING_EXPRESS_CENTS ?? 24900),
    merchantEmail: env.MERCHANT_EMAIL || 'orders@axleandco.test',
    stripe: {
      secretKey: env.STRIPE_SECRET_KEY || '',
      webhookSecret: env.STRIPE_WEBHOOK_SECRET || ''
    },
    mail: {
      mode: env.SMTP_HOST ? 'smtp' : 'file',
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT || 587),
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from: env.MAIL_FROM || 'Axle & Co. <no-reply@axleandco.test>',
      outboxDir: path.join(here, '..', 'outbox')
    },
    clientDist: path.join(here, '..', '..', 'client', 'dist')
  };
}
