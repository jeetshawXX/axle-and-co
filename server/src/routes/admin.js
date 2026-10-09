import { Router } from 'express';
import { z } from 'zod';
import { parse, wrap, notFound, conflict, badRequest } from '../errors.js';
import { requireAdmin } from '../middleware/auth.js';

const fitmentSchema = z.object({
  make: z.string().trim().min(1), model: z.string().trim().min(1),
  yearFrom: z.coerce.number().int().min(1950), yearTo: z.coerce.number().int().max(2100)
});

const productSchema = z.object({
  sku: z.string().trim().min(2, 'Enter a SKU').max(40),
  partNumber: z.string().trim().min(1, 'Enter a part number').max(40),
  name: z.string().trim().min(3, 'Enter a product name').max(140),
  brand: z.string().trim().min(1, 'Enter a brand').max(40),
  categoryId: z.coerce.number().int().positive('Choose a category'),
  supplierId: z.coerce.number().int().positive().nullable().optional(),
  description: z.string().trim().max(4000).default(''),
  specs: z.record(z.string(), z.string()).default({}),
  image: z.string().trim().max(300).default(''),
  priceCents: z.coerce.number().int().min(0, 'Price cannot be negative'),
  salePriceCents: z.coerce.number().int().min(0).nullable().optional(),
  costCents: z.coerce.number().int().min(0).default(0),
  stock: z.coerce.number().int().min(0, 'Stock cannot be negative'),
  lowStockThreshold: z.coerce.number().int().min(0).default(5),
  weightKg: z.coerce.number().min(0).default(1),
  isUniversal: z.boolean().default(false),
  isActive: z.boolean().default(true),
  fitment: z.array(fitmentSchema).default([])
}).refine((p) => p.salePriceCents == null || p.salePriceCents <= p.priceCents, { message: 'Sale price must not exceed the list price', path: ['salePriceCents'] });

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export function adminRoutes({ db, config, orders }) {
  const r = Router();
  r.use(requireAdmin);

  r.get('/stats', (_req, res) => {
    const live = `status != 'cancelled' AND payment_status = 'paid'`;
    const totals = db.prepare(`SELECT COUNT(*) AS orders, COALESCE(SUM(total_cents),0) AS revenue FROM orders WHERE ${live}`).get();
    const customers = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'customer'`).get().n;
    const byDay = db.prepare(`SELECT date(created_at) AS day, COUNT(*) AS orders, SUM(total_cents) AS revenue FROM orders
      WHERE ${live} AND created_at >= datetime('now', '-14 days') GROUP BY day ORDER BY day`).all();
    const byStatus = db.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status').all();
    const top = db.prepare(`SELECT i.product_id AS id, i.name, SUM(i.qty) AS units, SUM(i.qty * i.unit_price_cents) AS revenue
      FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.status != 'cancelled' AND o.payment_status = 'paid'
      GROUP BY i.product_id ORDER BY units DESC LIMIT 5`).all();
    const lowStock = db.prepare(`SELECT id, sku, name, stock, low_stock_threshold AS threshold FROM products
      WHERE is_active = 1 AND stock <= low_stock_threshold ORDER BY stock, name LIMIT 20`).all();
    const margin = db.prepare(`SELECT COALESCE(SUM(i.qty * (i.unit_price_cents - p.cost_cents)),0) AS gross FROM order_items i
      JOIN orders o ON o.id = i.order_id JOIN products p ON p.id = i.product_id WHERE o.status != 'cancelled' AND o.payment_status = 'paid'`).get().gross;
    res.json({
      orders: totals.orders, revenueCents: totals.revenue, customers, grossMarginCents: margin,
      averageOrderCents: totals.orders ? Math.round(totals.revenue / totals.orders) : 0,
      byDay: byDay.map((d) => ({ day: d.day, orders: d.orders, revenueCents: d.revenue })),
      byStatus, topProducts: top.map((t) => ({ id: t.id, name: t.name, units: t.units, revenueCents: t.revenue })), lowStock
    });
  });

  r.get('/reports/sales.csv', (_req, res) => {
    const rows = db.prepare(`SELECT o.number, o.created_at, o.email, o.status, o.payment_status, o.subtotal_cents, o.discount_cents,
      o.shipping_cents, o.tax_cents, o.total_cents, o.coupon_code, o.affiliate_ref FROM orders o ORDER BY o.created_at DESC`).all();
    const head = ['order', 'date', 'email', 'status', 'payment', 'subtotal', 'discount', 'shipping', 'tax', 'total', 'coupon', 'affiliate'];
    const lines = [head.join(',')].concat(rows.map((o) => [o.number, o.created_at, o.email, o.status, o.payment_status,
      o.subtotal_cents / 100, o.discount_cents / 100, o.shipping_cents / 100, o.tax_cents / 100, o.total_cents / 100, o.coupon_code, o.affiliate_ref].map(csvCell).join(',')));
    res.type('text/csv').attachment('sales.csv').send(lines.join('\n'));
  });

  // ---------- Products ----------
  const productRow = (id) => db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  const toAdmin = (p) => ({
    id: p.id, sku: p.sku, partNumber: p.part_number, name: p.name, brand: p.brand, categoryId: p.category_id,
    supplierId: p.supplier_id, description: p.description, specs: JSON.parse(p.specs), image: p.image,
    priceCents: p.price_cents, salePriceCents: p.sale_price_cents, costCents: p.cost_cents, stock: p.stock,
    lowStockThreshold: p.low_stock_threshold, weightKg: p.weight_kg, isUniversal: !!p.is_universal, isActive: !!p.is_active,
    fitment: db.prepare('SELECT make, model, year_from AS yearFrom, year_to AS yearTo FROM product_fitment WHERE product_id = ?').all(p.id)
  });

  r.get('/products', (req, res) => {
    const q = `%${String(req.query.q || '').trim()}%`;
    const rows = db.prepare(`SELECT p.*, c.name AS category_name, s.name AS supplier_name FROM products p
      JOIN categories c ON c.id = p.category_id LEFT JOIN suppliers s ON s.id = p.supplier_id
      WHERE (p.name LIKE ? OR p.sku LIKE ? OR p.part_number LIKE ?) ORDER BY p.id DESC LIMIT 200`).all(q, q, q);
    res.json({ products: rows.map((p) => ({ ...toAdmin(p), categoryName: p.category_name, supplierName: p.supplier_name })) });
  });

  r.get('/products/:id', (req, res) => {
    const p = productRow(req.params.id);
    if (!p) throw notFound('Product not found');
    res.json({ product: toAdmin(p) });
  });

  const saveFitment = (id, list) => {
    db.prepare('DELETE FROM product_fitment WHERE product_id = ?').run(id);
    const ins = db.prepare('INSERT INTO product_fitment (product_id, make, model, year_from, year_to) VALUES (?, ?, ?, ?, ?)');
    for (const f of list) ins.run(id, f.make, f.model, f.yearFrom, f.yearTo);
  };

  r.post('/products', wrap(async (req, res) => {
    const b = parse(productSchema, req.body);
    if (db.prepare('SELECT 1 FROM products WHERE sku = ?').get(b.sku)) throw conflict('A product with this SKU already exists');
    if (!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(b.categoryId)) throw badRequest('Choose a valid category');
    const id = db.transaction(() => {
      const newId = db.prepare(`INSERT INTO products (sku, part_number, name, brand, category_id, supplier_id, description, specs, image, price_cents,
        sale_price_cents, cost_cents, stock, low_stock_threshold, weight_kg, is_universal, is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(b.sku, b.partNumber, b.name, b.brand, b.categoryId, b.supplierId ?? null, b.description, JSON.stringify(b.specs), b.image,
          b.priceCents, b.salePriceCents ?? null, b.costCents, b.stock, b.lowStockThreshold, b.weightKg, b.isUniversal ? 1 : 0, b.isActive ? 1 : 0).lastInsertRowid;
      saveFitment(newId, b.fitment);
      return newId;
    })();
    res.status(201).json({ product: toAdmin(productRow(id)) });
  }));

  r.put('/products/:id', wrap(async (req, res) => {
    const existing = productRow(req.params.id);
    if (!existing) throw notFound('Product not found');
    const b = parse(productSchema, req.body);
    const clash = db.prepare('SELECT id FROM products WHERE sku = ? AND id != ?').get(b.sku, existing.id);
    if (clash) throw conflict('Another product already uses this SKU');
    db.transaction(() => {
      db.prepare(`UPDATE products SET sku=?, part_number=?, name=?, brand=?, category_id=?, supplier_id=?, description=?, specs=?, image=?,
        price_cents=?, sale_price_cents=?, cost_cents=?, stock=?, low_stock_threshold=?, weight_kg=?, is_universal=?, is_active=? WHERE id=?`)
        .run(b.sku, b.partNumber, b.name, b.brand, b.categoryId, b.supplierId ?? null, b.description, JSON.stringify(b.specs), b.image,
          b.priceCents, b.salePriceCents ?? null, b.costCents, b.stock, b.lowStockThreshold, b.weightKg, b.isUniversal ? 1 : 0, b.isActive ? 1 : 0, existing.id);
      saveFitment(existing.id, b.fitment);
    })();
    res.json({ product: toAdmin(productRow(existing.id)) });
  }));

  r.patch('/products/:id/stock', (req, res) => {
    const { stock } = parse(z.object({ stock: z.coerce.number().int().min(0, 'Stock cannot be negative') }), req.body);
    const info = db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(stock, req.params.id);
    if (!info.changes) throw notFound('Product not found');
    res.json({ product: toAdmin(productRow(req.params.id)) });
  });

  /** "Delete" hides the product but keeps order history intact. */
  r.delete('/products/:id', (req, res) => {
    const info = db.prepare('UPDATE products SET is_active = 0 WHERE id = ?').run(req.params.id);
    if (!info.changes) throw notFound('Product not found');
    res.json({ ok: true });
  });

  // ---------- Orders ----------
  r.get('/orders', (req, res) => {
    const status = req.query.status ? String(req.query.status) : null;
    const rows = db.prepare(`SELECT * FROM orders ${status ? 'WHERE status = ?' : ''} ORDER BY created_at DESC, id DESC LIMIT 200`).all(...(status ? [status] : []));
    res.json({ orders: rows.map((row) => orders.hydrate(row)) });
  });

  r.get('/orders/:number', (req, res) => {
    const o = orders.byNumber(req.params.number);
    if (!o) throw notFound('Order not found');
    res.json({ order: o });
  });

  r.patch('/orders/:number', wrap(async (req, res) => {
    const body = parse(z.object({
      status: z.enum(['processing', 'shipped', 'delivered', 'cancelled']),
      carrier: z.string().trim().max(60).optional(), trackingNumber: z.string().trim().max(60).optional()
    }), req.body);
    res.json({ order: await orders.advance(req.params.number, body) });
  }));

  // ---------- Suppliers & inventory feeds ----------
  r.get('/suppliers', (_req, res) => {
    res.json({ suppliers: db.prepare(`SELECT s.id, s.name, s.lead_time_days AS leadTimeDays, s.dropship, s.contact_email AS contactEmail,
      (SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id) AS productCount FROM suppliers s ORDER BY s.name`).all().map((s) => ({ ...s, dropship: !!s.dropship })) });
  });

  /**
   * Accepts a supplier's stock feed: [{ sku, stock, costCents? }].
   * In production this endpoint would be called by a scheduled job or the supplier's webhook.
   */
  r.post('/suppliers/:id/sync', (req, res) => {
    const supplier = db.prepare('SELECT id FROM suppliers WHERE id = ?').get(req.params.id);
    if (!supplier) throw notFound('Supplier not found');
    const { items } = parse(z.object({ items: z.array(z.object({
      sku: z.string().min(1), stock: z.coerce.number().int().min(0), costCents: z.coerce.number().int().min(0).optional()
    })).max(5000) }), req.body);
    let updated = 0;
    const unknown = [];
    db.transaction(() => {
      for (const it of items) {
        const info = db.prepare('UPDATE products SET stock = ?, cost_cents = COALESCE(?, cost_cents) WHERE sku = ? AND supplier_id = ?')
          .run(it.stock, it.costCents ?? null, it.sku, supplier.id);
        if (info.changes) updated++; else unknown.push(it.sku);
      }
    })();
    res.json({ updated, unknown });
  });

  // ---------- Coupons / promotions ----------
  r.get('/coupons', (_req, res) => {
    res.json({ coupons: db.prepare('SELECT code, percent_off AS percentOff, min_subtotal_cents AS minSubtotalCents, expires_at AS expiresAt, is_active AS isActive FROM coupons ORDER BY code').all() });
  });

  r.post('/coupons', (req, res) => {
    const b = parse(z.object({
      code: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, - or _'),
      percentOff: z.coerce.number().int().min(1).max(90),
      minSubtotalCents: z.coerce.number().int().min(0).default(0),
      expiresAt: z.string().optional()
    }), req.body);
    if (db.prepare('SELECT 1 FROM coupons WHERE code = ?').get(b.code)) throw conflict('That code already exists');
    db.prepare('INSERT INTO coupons (code, percent_off, min_subtotal_cents, expires_at) VALUES (?,?,?,?)').run(b.code, b.percentOff, b.minSubtotalCents, b.expiresAt || null);
    res.status(201).json({ ok: true });
  });

  r.patch('/coupons/:code', (req, res) => {
    const { isActive } = parse(z.object({ isActive: z.boolean() }), req.body);
    const info = db.prepare('UPDATE coupons SET is_active = ? WHERE code = ?').run(isActive ? 1 : 0, req.params.code);
    if (!info.changes) throw notFound('Coupon not found');
    res.json({ ok: true });
  });

  r.get('/meta', (_req, res) => {
    res.json({
      categories: db.prepare('SELECT id, slug, name FROM categories ORDER BY id').all(),
      suppliers: db.prepare('SELECT id, name FROM suppliers ORDER BY name').all()
    });
  });

  return r;
}
