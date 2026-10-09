import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, ADDRESS } from './helpers.js';

// Exercises the hosted-Stripe branch with a stubbed gateway (no network, no real keys).
let t;
before(async () => { t = await startApp(); });
after(async () => { await t.close(); });

const idOf = (sku) => t.db.prepare('SELECT id FROM products WHERE sku = ?').get(sku).id;
const stockOf = (sku) => t.db.prepare('SELECT stock FROM products WHERE sku = ?').get(sku).stock;

async function shopper() {
  const email = `s${Math.random().toString(36).slice(2, 8)}@example.test`;
  const r = await t.post('/api/auth/register', { name: 'Stripe Buyer', email, password: 'Passw0rd!' });
  await t.put('/api/cart/items', { productId: idOf('TLS-GAUGE'), qty: 1 }, r.body.token);
  return r.body.token;
}

test('Stripe mode: order is created pending, stock reserved, shopper redirected; paid session confirms it', async () => {
  const pay = t.app.locals.payments;
  const original = { provider: pay.provider, create: pay.createStripeSession, retrieve: pay.retrieveStripeSession };
  t.db.prepare("UPDATE products SET stock = 10 WHERE sku = 'TLS-GAUGE'").run();
  let sessionPaid = false;
  let createdFor = null;
  pay.provider = 'stripe';
  pay.createStripeSession = async (order) => { createdFor = order; return { id: 'cs_test_123', url: 'https://checkout.stripe.test/pay/cs_test_123' }; };
  pay.retrieveStripeSession = async () => ({ payment_status: sessionPaid ? 'paid' : 'unpaid', metadata: { order_number: createdFor.number }, payment_intent: 'pi_test_1', id: 'cs_test_123' });
  try {
    const token = await shopper();
    const res = await t.post('/api/orders', { shippingAddress: ADDRESS, shippingMethod: 'standard' }, token);
    assert.equal(res.status, 201, res.text);
    assert.equal(res.body.redirectUrl, 'https://checkout.stripe.test/pay/cs_test_123');
    assert.equal(res.body.order.status, 'pending_payment');
    assert.equal(stockOf('TLS-GAUGE'), 9, 'stock is held while the shopper pays');
    assert.equal(createdFor.totalCents, res.body.order.totalCents, 'the charged amount is the server-computed total');

    const early = await t.post(`/api/orders/${res.body.order.number}/confirm-payment`, { sessionId: 'cs_test_123' }, token);
    assert.equal(early.status, 409, 'cannot confirm before Stripe reports it paid');

    sessionPaid = true;
    const ok = await t.post(`/api/orders/${res.body.order.number}/confirm-payment`, { sessionId: 'cs_test_123' }, token);
    assert.equal(ok.body.order.status, 'paid');
    const again = await t.post(`/api/orders/${res.body.order.number}/confirm-payment`, { sessionId: 'cs_test_123' }, token);
    assert.equal(again.status, 200, 'confirming twice is harmless');
    assert.equal(stockOf('TLS-GAUGE'), 9, 'stock is not reduced twice');
    assert.equal(t.app.locals.mailer.sent.filter((m) => m.subject.includes(res.body.order.number) && m.to !== t.config.merchantEmail).length, 1, 'one receipt only');
  } finally { Object.assign(pay, { provider: original.provider, createStripeSession: original.create, retrieveStripeSession: original.retrieve }); }
});

test('Stripe mode: a session for a different order is rejected; a failed session start releases stock', async () => {
  const pay = t.app.locals.payments;
  const original = { provider: pay.provider, create: pay.createStripeSession, retrieve: pay.retrieveStripeSession };
  t.db.prepare("UPDATE products SET stock = 10 WHERE sku = 'TLS-GAUGE'").run();
  pay.provider = 'stripe';
  try {
    pay.createStripeSession = async () => ({ id: 'cs_x', url: 'https://checkout.stripe.test/x' });
    pay.retrieveStripeSession = async () => ({ payment_status: 'paid', metadata: { order_number: 'AX-OTHER' }, id: 'cs_x' });
    const token = await shopper();
    const res = await t.post('/api/orders', { shippingAddress: ADDRESS }, token);
    const bad = await t.post(`/api/orders/${res.body.order.number}/confirm-payment`, { sessionId: 'cs_test_x' }, token);
    assert.equal(bad.status, 403);

    pay.createStripeSession = async () => { throw new Error('stripe is down'); };
    t.db.prepare("UPDATE products SET stock = 10 WHERE sku = 'TLS-GAUGE'").run();
    const token2 = await shopper();
    const fail = await t.post('/api/orders', { shippingAddress: ADDRESS }, token2);
    assert.equal(fail.status, 500);
    assert.equal(stockOf('TLS-GAUGE'), 10, 'stock released when payment could not start');
  } finally { Object.assign(pay, { provider: original.provider, createStripeSession: original.create, retrieveStripeSession: original.retrieve }); }
});
