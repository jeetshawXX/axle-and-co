import express from 'express';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { authenticate } from './middleware/auth.js';
import { HttpError } from './errors.js';
import { createMailer } from './services/mailer.js';
import { createPayments } from './services/payments.js';
import { createOrderService } from './services/orders.js';
import { authRoutes } from './routes/auth.js';
import { catalogRoutes } from './routes/catalog.js';
import { cartRoutes } from './routes/cart.js';
import { orderRoutes } from './routes/orders.js';
import { adminRoutes } from './routes/admin.js';
import { seoRoutes } from './routes/seo.js';

/** Builds the Express app. Everything it needs is passed in, so tests can use an in-memory database. */
export function createApp({ db, config, mailMode, bcryptRounds }) {
  const app = express();
  const mailer = createMailer(config, { mode: mailMode });
  const payments = createPayments(config);
  const orders = createOrderService({ db, config, mailer, payments });
  app.locals = { db, config, mailer, payments, orders };

  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
        formAction: ["'self'", 'https://checkout.stripe.com']
      }
    }
  }));

  // Stripe webhook needs the raw body for signature checks, so it is mounted before express.json().
  app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res, next) => {
    try {
      if (payments.provider !== 'stripe' || !config.stripe.webhookSecret) return res.status(404).end();
      const event = payments.stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], config.stripe.webhookSecret);
      if (event.type === 'checkout.session.completed' && event.data.object.payment_status === 'paid') {
        await orders.markPaid(event.data.object.metadata.order_number, { ref: event.data.object.payment_intent });
      }
      if (event.type === 'checkout.session.expired') orders.failPayment(event.data.object.metadata.order_number, 'Payment window expired');
      res.json({ received: true });
    } catch (err) {
      res.status(400).send(`Webhook error: ${err.message}`);
    }
  });

  app.use(express.json({ limit: '200kb' }));
  app.use(authenticate({ db, config }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, payments: payments.provider }));
  app.get('/api/config', (_req, res) => res.json({
    storeName: config.storeName, currency: config.currency, locale: config.locale,
    freeShippingOverCents: config.freeShippingOverCents, shippingStandardCents: config.shippingStandardCents,
    shippingExpressCents: config.shippingExpressCents, taxRate: config.taxRate, payments: payments.provider
  }));

  app.use('/api/auth', authRoutes({ db, config, bcryptRounds }));
  app.use('/api', catalogRoutes({ db, config }));
  app.use('/api', cartRoutes({ db, config }));
  app.use('/api/orders', orderRoutes({ db, config, orders, payments }));
  app.use('/api/admin', adminRoutes({ db, config, orders }));
  app.use(seoRoutes({ db, config }));

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

  // Serve the built React app (production / `npm start`), with SPA fallback.
  if (fs.existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist, { maxAge: '1h', index: false }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(config.clientDist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
  });

  return app;
}
