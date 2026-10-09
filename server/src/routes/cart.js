import { Router } from 'express';
import { z } from 'zod';
import { parse, notFound } from '../errors.js';
import { requireUser } from '../middleware/auth.js';
import { quote } from '../services/pricing.js';

const itemsSchema = z.array(z.object({
  productId: z.coerce.number().int().positive(),
  qty: z.coerce.number().int().min(1).max(99)
})).max(100);

const quoteSchema = z.object({
  items: itemsSchema,
  couponCode: z.string().trim().max(40).optional(),
  shippingMethod: z.enum(['standard', 'express']).default('standard')
});

export function cartRoutes({ db, config }) {
  const r = Router();
  const rowsFor = (userId) => db.prepare('SELECT product_id AS productId, qty FROM cart_items WHERE user_id = ? ORDER BY updated_at, product_id').all(userId);
  const respond = (res, userId) => {
    const items = rowsFor(userId);
    res.json({ items, quote: quote({ db, config }, { items, shippingMethod: 'standard' }) });
  };

  /** Public: price any basket (guests keep their cart in the browser). */
  r.post('/pricing/quote', (req, res) => {
    const body = parse(quoteSchema, req.body);
    res.json({ quote: quote({ db, config }, body) });
  });

  r.get('/cart', requireUser, (req, res) => respond(res, req.user.id));

  r.put('/cart/items', requireUser, (req, res) => {
    const { productId, qty } = parse(z.object({ productId: z.coerce.number().int().positive(), qty: z.coerce.number().int().min(0).max(99) }), req.body);
    const p = db.prepare('SELECT stock FROM products WHERE id = ? AND is_active = 1').get(productId);
    if (!p) throw notFound('That part is no longer available');
    if (qty === 0) db.prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?').run(req.user.id, productId);
    else {
      db.prepare(`INSERT INTO cart_items (user_id, product_id, qty) VALUES (?, ?, ?)
        ON CONFLICT (user_id, product_id) DO UPDATE SET qty = excluded.qty, updated_at = datetime('now')`).run(req.user.id, productId, qty);
    }
    respond(res, req.user.id);
  });

  r.delete('/cart/items/:productId', requireUser, (req, res) => {
    db.prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?').run(req.user.id, Number(req.params.productId));
    respond(res, req.user.id);
  });

  /** Merges a guest cart into the account on sign-in (larger quantity wins). */
  r.post('/cart/merge', requireUser, (req, res) => {
    const items = parse(z.object({ items: itemsSchema }), req.body).items;
    const exists = db.prepare('SELECT 1 FROM products WHERE id = ? AND is_active = 1');
    const upsert = db.prepare(`INSERT INTO cart_items (user_id, product_id, qty) VALUES (?, ?, ?)
      ON CONFLICT (user_id, product_id) DO UPDATE SET qty = MAX(qty, excluded.qty), updated_at = datetime('now')`);
    db.transaction(() => { for (const i of items) if (exists.get(i.productId)) upsert.run(req.user.id, i.productId, i.qty); })();
    respond(res, req.user.id);
  });

  return r;
}
