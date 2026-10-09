import crypto from 'node:crypto';
import { badRequest, conflict, notFound } from '../errors.js';
import { quote } from './pricing.js';

const CANCELLABLE = ['pending_payment', 'paid', 'processing'];

export const NEXT_STATUS = { paid: 'processing', processing: 'shipped', shipped: 'delivered' };

function newNumber() {
  const d = new Date();
  const ymd = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  return `AX-${ymd}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

export function createOrderService({ db, config, mailer, payments }) {
  const addEvent = db.prepare('INSERT INTO order_events (order_id, status, note) VALUES (?, ?, ?)');

  function hydrate(row) {
    if (!row) return null;
    const items = db.prepare('SELECT product_id, sku, name, unit_price_cents, qty FROM order_items WHERE order_id = ? ORDER BY id').all(row.id)
      .map((i) => ({ productId: i.product_id, sku: i.sku, name: i.name, unitPriceCents: i.unit_price_cents, qty: i.qty }));
    const events = db.prepare('SELECT status, note, created_at FROM order_events WHERE order_id = ? ORDER BY id').all(row.id)
      .map((e) => ({ status: e.status, note: e.note, at: e.created_at }));
    return {
      id: row.id, number: row.number, userId: row.user_id, email: row.email,
      status: row.status, paymentStatus: row.payment_status, paymentProvider: row.payment_provider,
      cardLast4: row.card_last4,
      subtotalCents: row.subtotal_cents, discountCents: row.discount_cents, shippingCents: row.shipping_cents,
      taxCents: row.tax_cents, totalCents: row.total_cents, couponCode: row.coupon_code,
      shippingMethod: row.shipping_method, shippingAddress: JSON.parse(row.shipping_address),
      carrier: row.carrier, trackingNumber: row.tracking_number, affiliateRef: row.affiliate_ref,
      createdAt: row.created_at, updatedAt: row.updated_at, items, events, currency: config.currency
    };
  }

  const byNumber = (number) => hydrate(db.prepare('SELECT * FROM orders WHERE number = ?').get(number));

  /**
   * Prices the basket again on the server and creates the order, reserving stock
   * in the same transaction so two shoppers can never buy the last unit.
   */
  const createPending = db.transaction((user, input) => {
    const q = quote({ db, config }, { items: input.items, couponCode: input.couponCode, shippingMethod: input.shippingMethod });
    if (!q.lines.length) throw badRequest('Your cart is empty');
    if (q.issues.length) throw conflict(q.issues[0].message);
    if (input.couponCode && q.couponError) throw badRequest(q.couponError);

    let number;
    do { number = newNumber(); } while (db.prepare('SELECT 1 FROM orders WHERE number = ?').get(number));

    const info = db.prepare(`INSERT INTO orders
      (number, user_id, status, payment_status, payment_provider, subtotal_cents, discount_cents, shipping_cents, tax_cents,
       total_cents, coupon_code, shipping_method, shipping_address, email, affiliate_ref)
      VALUES (?, ?, 'pending_payment', 'unpaid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      number, user.id, payments.provider, q.subtotalCents, q.discountCents, q.shippingCents, q.taxCents, q.totalCents,
      q.coupon?.code || null, q.shippingMethod, JSON.stringify(input.shippingAddress), user.email, input.affiliateRef || null
    );
    const orderId = info.lastInsertRowid;
    const insItem = db.prepare('INSERT INTO order_items (order_id, product_id, sku, name, unit_price_cents, qty) VALUES (?, ?, ?, ?, ?, ?)');
    const takeStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?');
    for (const l of q.lines) {
      if (takeStock.run(l.qty, l.productId, l.qty).changes === 0) throw conflict(`Only part of ${l.name} is still in stock`);
      insItem.run(orderId, l.productId, l.sku, l.name, l.unitPriceCents, l.qty);
    }
    addEvent.run(orderId, 'pending_payment', 'Order placed, waiting for payment');
    db.prepare('UPDATE users SET default_address = ? WHERE id = ?').run(JSON.stringify(input.shippingAddress), user.id);
    return number;
  });

  const restoreStock = (orderId) => {
    for (const i of db.prepare('SELECT product_id, qty FROM order_items WHERE order_id = ?').all(orderId)) {
      db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(i.qty, i.product_id);
    }
  };

  /** Marks an order paid (idempotent), clears the buyer's cart and sends receipts. */
  async function markPaid(number, { ref, last4 } = {}) {
    const order = byNumber(number);
    if (!order) throw notFound('Order not found');
    if (order.paymentStatus === 'paid') return order;
    if (order.status === 'cancelled') throw conflict('This order was cancelled');
    db.transaction(() => {
      db.prepare(`UPDATE orders SET status = 'paid', payment_status = 'paid', payment_ref = ?, card_last4 = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(ref || null, last4 || null, order.id);
      addEvent.run(order.id, 'paid', 'Payment received');
      db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(order.userId);
    })();
    const paid = byNumber(number);
    await mailer.sendReceipt(paid);
    return paid;
  }

  /** Releases reserved stock for an order that never got paid. */
  function failPayment(number, note) {
    const order = byNumber(number);
    if (!order || order.status !== 'pending_payment') return order;
    db.transaction(() => {
      restoreStock(order.id);
      db.prepare(`UPDATE orders SET status = 'cancelled', payment_status = 'failed', updated_at = datetime('now') WHERE id = ?`).run(order.id);
      addEvent.run(order.id, 'cancelled', note || 'Payment failed');
    })();
    return byNumber(number);
  }

  async function cancel(number, note = 'Cancelled by customer') {
    const order = byNumber(number);
    if (!order) throw notFound('Order not found');
    if (!CANCELLABLE.includes(order.status)) throw conflict('This order can no longer be cancelled');
    const refund = order.paymentStatus === 'paid' ? (order.paymentProvider === 'mock' ? 'refunded' : 'refund_pending') : order.paymentStatus === 'unpaid' ? 'failed' : order.paymentStatus;
    db.transaction(() => {
      restoreStock(order.id);
      db.prepare(`UPDATE orders SET status = 'cancelled', payment_status = ?, updated_at = datetime('now') WHERE id = ?`).run(refund, order.id);
      addEvent.run(order.id, 'cancelled', note);
    })();
    const out = byNumber(number);
    await mailer.sendCancelled(out);
    return out;
  }

  /** Admin status changes. Shipping needs a carrier and tracking number. */
  async function advance(number, { status, carrier, trackingNumber }) {
    const order = byNumber(number);
    if (!order) throw notFound('Order not found');
    if (status === 'cancelled') return cancel(number, 'Cancelled by store');
    if (NEXT_STATUS[order.status] !== status) throw conflict(`Cannot move an order from ${order.status} to ${status}`);
    if (status === 'shipped' && (!carrier || !trackingNumber)) throw badRequest('Enter a carrier and tracking number to ship');
    db.transaction(() => {
      if (status === 'shipped') {
        db.prepare(`UPDATE orders SET status = ?, carrier = ?, tracking_number = ?, updated_at = datetime('now') WHERE id = ?`).run(status, carrier, trackingNumber, order.id);
        addEvent.run(order.id, status, `Shipped with ${carrier}, tracking ${trackingNumber}`);
      } else {
        db.prepare(`UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, order.id);
        addEvent.run(order.id, status, status === 'processing' ? 'We are preparing your parts' : 'Delivered');
      }
    })();
    const out = byNumber(number);
    if (status === 'shipped') await mailer.sendShipped(out);
    return out;
  }

  /** Frees stock held by unpaid orders (e.g. abandoned hosted-checkout sessions). */
  function expireStale(minutes = 30) {
    const stale = db.prepare(`SELECT number FROM orders WHERE status = 'pending_payment' AND created_at < datetime('now', ?)`).all(`-${minutes} minutes`);
    for (const s of stale) failPayment(s.number, 'Payment window expired');
    return stale.length;
  }

  return { createPending, byNumber, hydrate, markPaid, failPayment, cancel, advance, expireStale };
}
