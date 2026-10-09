import { Router } from 'express';
import { z } from 'zod';
import { parse, wrap, notFound, forbidden, badRequest, conflict } from '../errors.js';
import { requireUser } from '../middleware/auth.js';

export const addressSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the recipient name').max(80),
  phone: z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/, 'Enter a valid phone number'),
  line1: z.string().trim().min(3, 'Enter the street address').max(120),
  line2: z.string().trim().max(120).optional().default(''),
  city: z.string().trim().min(2, 'Enter the city').max(60),
  state: z.string().trim().min(2, 'Enter the state').max(60),
  postalCode: z.string().trim().regex(/^[A-Za-z0-9\- ]{4,10}$/, 'Enter a valid postal code')
});

const checkoutSchema = z.object({
  shippingAddress: addressSchema,
  shippingMethod: z.enum(['standard', 'express']).default('standard'),
  couponCode: z.string().trim().max(40).optional(),
  affiliateRef: z.string().trim().regex(/^[A-Za-z0-9_-]{1,40}$/).optional(),
  card: z.object({
    name: z.string().optional(), number: z.string().optional(), expiry: z.string().optional(), cvc: z.string().optional()
  }).optional()
});

const summary = (o) => ({
  number: o.number, status: o.status, paymentStatus: o.paymentStatus, totalCents: o.totalCents,
  createdAt: o.createdAt, itemCount: o.items.reduce((s, i) => s + i.qty, 0), items: o.items.slice(0, 3).map((i) => i.name)
});

export function orderRoutes({ db, config, orders, payments }) {
  const r = Router();
  r.use(requireUser);

  /** Place an order from the signed-in user's saved cart. */
  r.post('/', wrap(async (req, res) => {
    const body = parse(checkoutSchema, req.body);
    const items = db.prepare('SELECT product_id AS productId, qty FROM cart_items WHERE user_id = ?').all(req.user.id);
    if (!items.length) throw badRequest('Your cart is empty');

    if (payments.provider === 'mock') {
      if (!body.card) throw badRequest('Enter your card details');
      const number = orders.createPending(req.user, { ...body, items });
      const order = orders.byNumber(number);
      const charge = payments.chargeMock(body.card, order.totalCents);
      if (!charge.ok) {
        orders.failPayment(number, charge.message);
        return res.status(402).json({ error: charge.message });
      }
      const paid = await orders.markPaid(number, { ref: charge.ref, last4: charge.last4 });
      return res.status(201).json({ order: paid });
    }

    const number = orders.createPending(req.user, { ...body, items });
    const order = orders.byNumber(number);
    try {
      const session = await payments.createStripeSession(order);
      db.prepare('UPDATE orders SET payment_ref = ? WHERE id = ?').run(session.id, order.id);
      res.status(201).json({ order, redirectUrl: session.url });
    } catch (err) {
      orders.failPayment(number, 'Could not start payment');
      throw err;
    }
  }));

  r.get('/', (req, res) => {
    const rows = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC, id DESC').all(req.user.id);
    res.json({ orders: rows.map((row) => summary(orders.hydrate(row))) });
  });

  const own = (req) => {
    const order = orders.byNumber(req.params.number);
    if (!order) throw notFound('We could not find that order');
    if (order.userId !== req.user.id && req.user.role !== 'admin') throw forbidden();
    return order;
  };

  r.get('/:number', (req, res) => res.json({ order: own(req) }));

  /** Called when the shopper returns from Stripe's hosted page. */
  r.post('/:number/confirm-payment', wrap(async (req, res) => {
    const order = own(req);
    if (payments.provider !== 'stripe') throw badRequest('Not applicable');
    const sessionId = parse(z.object({ sessionId: z.string().min(5) }), req.body).sessionId;
    const session = await payments.retrieveStripeSession(sessionId);
    if (session.metadata?.order_number !== order.number) throw forbidden();
    if (session.payment_status !== 'paid') throw conflict('Payment has not been completed yet');
    res.json({ order: await orders.markPaid(order.number, { ref: session.payment_intent || session.id }) });
  }));

  r.post('/:number/cancel', wrap(async (req, res) => {
    const order = own(req);
    res.json({ order: await orders.cancel(order.number) });
  }));

  return r;
}
