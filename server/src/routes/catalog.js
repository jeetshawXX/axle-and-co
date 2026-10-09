import { Router } from 'express';
import { z } from 'zod';
import { parse, wrap, notFound, forbidden, conflict } from '../errors.js';
import { requireUser } from '../middleware/auth.js';
import { PRODUCT_COLUMNS, toProduct, fitSql, fitsVehicle } from '../services/products.js';
import { pickMatch, RANK_SQL } from '../services/search.js';

const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().optional(),
  brand: z.string().trim().optional(),
  make: z.string().trim().optional(),
  model: z.string().trim().optional(),
  year: z.coerce.number().int().min(1950).max(2100).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  inStock: z.enum(['1', 'true']).optional(),
  onSale: z.enum(['1', 'true']).optional(),
  isNew: z.enum(['1', 'true']).optional(),
  sort: z.enum(['relevance', 'price_asc', 'price_desc', 'newest', 'name']).default('relevance'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(12)
});

const PRICE = 'COALESCE(p.sale_price_cents, p.price_cents)';

export function catalogRoutes({ db, config }) {
  const r = Router();

  r.get('/categories', (_req, res) => {
    const rows = db.prepare(`SELECT c.id, c.slug, c.name, c.description, c.image,
      (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_active = 1) AS productCount
      FROM categories c ORDER BY c.id`).all();
    res.json({ categories: rows });
  });

  /** Vehicle tree for the selector: [{ make, models: [{ model, yearFrom, yearTo }] }] */
  r.get('/vehicles', (_req, res) => {
    const rows = db.prepare('SELECT make, model, year_from, year_to FROM vehicles ORDER BY make, model').all();
    const makes = new Map();
    for (const v of rows) {
      if (!makes.has(v.make)) makes.set(v.make, []);
      makes.get(v.make).push({ model: v.model, yearFrom: v.year_from, yearTo: v.year_to });
    }
    res.json({ makes: [...makes].map(([make, models]) => ({ make, models })) });
  });

  r.get('/brands', (_req, res) => {
    res.json({ brands: db.prepare('SELECT DISTINCT brand FROM products WHERE is_active = 1 ORDER BY brand').all().map((b) => b.brand) });
  });

  r.get('/products', (req, res) => {
    const f = parse(listSchema, req.query);
    const where = ['p.is_active = 1'];
    const params = [];
    const joins = ['JOIN categories c ON c.id = p.category_id'];

    let rankSelect = '0 AS rank';
    let match = null;
    if (f.q) {
      match = pickMatch(db, f.q);
      if (!match) return res.json({ products: [], total: 0, page: f.page, pages: 0, query: f.q });
      joins.push('JOIN products_fts ON products_fts.rowid = p.id');
      where.push('products_fts MATCH ?');
      params.push(match);
      rankSelect = `${RANK_SQL} AS rank`;
    }
    if (f.category) { where.push('c.slug = ?'); params.push(f.category); }
    if (f.brand) { where.push('p.brand = ?'); params.push(f.brand); }
    if (f.make && f.model && f.year) {
      const [sql, p] = fitSql({ make: f.make, model: f.model, year: f.year });
      where.push(sql); params.push(...p);
    }
    if (f.minPrice != null) { where.push(`${PRICE} >= ?`); params.push(f.minPrice); }
    if (f.maxPrice != null) { where.push(`${PRICE} <= ?`); params.push(f.maxPrice); }
    if (f.inStock) where.push('p.stock > 0');
    if (f.onSale) where.push('p.sale_price_cents IS NOT NULL AND p.sale_price_cents < p.price_cents');
    if (f.isNew) where.push(`p.created_at >= datetime('now', '-30 days')`);

    const order = {
      relevance: match ? 'rank ASC, p.stock > 0 DESC' : 'p.stock > 0 DESC, p.id ASC',
      price_asc: `${PRICE} ASC`, price_desc: `${PRICE} DESC`,
      newest: 'p.created_at DESC, p.id DESC', name: 'p.name COLLATE NOCASE ASC'
    }[f.sort];

    const from = `FROM products p ${joins.join(' ')} WHERE ${where.join(' AND ')}`;
    const total = db.prepare(`SELECT COUNT(*) AS n ${from}`).get(...params).n;
    const rows = db.prepare(`SELECT ${PRODUCT_COLUMNS}, ${rankSelect} ${from} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .all(...params, f.limit, (f.page - 1) * f.limit);

    const vehicle = f.make && f.model && f.year ? { make: f.make, model: f.model, year: f.year } : null;
    res.json({
      products: rows.map((row) => toProduct(row, vehicle ? { fits: true } : {})),
      total, page: f.page, pages: Math.ceil(total / f.limit), query: f.q || '', vehicle
    });
  });

  /** Type-ahead: top matches by name or part number. */
  r.get('/products/suggest', (req, res) => {
    const q = String(req.query.q || '').trim();
    const match = q.length >= 2 ? pickMatch(db, q) : null;
    if (!match) return res.json({ suggestions: [] });
    const rows = db.prepare(`SELECT p.id, p.sku, p.name, p.brand, p.part_number, p.image,
        COALESCE(p.sale_price_cents, p.price_cents) AS price_cents
      FROM products p JOIN products_fts ON products_fts.rowid = p.id
      WHERE products_fts MATCH ? AND p.is_active = 1 ORDER BY ${RANK_SQL} LIMIT 6`).all(match);
    res.json({ suggestions: rows.map((x) => ({ id: x.id, sku: x.sku, name: x.name, brand: x.brand, partNumber: x.part_number, image: x.image, priceCents: x.price_cents })) });
  });

  const findProduct = (key) => {
    const col = /^\d+$/.test(String(key)) ? 'p.id' : 'p.sku';
    return db.prepare(`SELECT ${PRODUCT_COLUMNS} FROM products p JOIN categories c ON c.id = p.category_id WHERE ${col} = ? AND p.is_active = 1`).get(key);
  };

  r.get('/products/:key', (req, res) => {
    const row = findProduct(req.params.key);
    if (!row) throw notFound('We could not find that part');
    const stats = db.prepare('SELECT COUNT(*) AS n, AVG(rating) AS avg FROM reviews WHERE product_id = ?').get(row.id);
    const fitment = db.prepare('SELECT make, model, year_from, year_to FROM product_fitment WHERE product_id = ? ORDER BY make, model').all(row.id)
      .map((f) => ({ make: f.make, model: f.model, yearFrom: f.year_from, yearTo: f.year_to }));
    const product = toProduct(row, {
      rating: stats.n ? Math.round(stats.avg * 10) / 10 : null, reviewCount: stats.n, fitment
    });
    const { make, model, year } = req.query;
    if (make && model && year) product.fits = fitsVehicle(db, row.id, { make, model, year: Number(year) });
    res.json({ product });
  });

  /** Alternates: explicit links first, then same-category parts for the same vehicles. */
  r.get('/products/:key/related', (req, res) => {
    const row = findProduct(req.params.key);
    if (!row) throw notFound('We could not find that part');
    const alternates = db.prepare(`SELECT ${PRODUCT_COLUMNS} FROM product_alternates a JOIN products p ON p.id = a.alternate_id
      JOIN categories c ON c.id = p.category_id WHERE a.product_id = ? AND p.is_active = 1`).all(row.id);
    const seen = new Set([row.id, ...alternates.map((a) => a.id)]);
    const sameFit = db.prepare(`SELECT DISTINCT ${PRODUCT_COLUMNS} FROM products p JOIN categories c ON c.id = p.category_id
      JOIN product_fitment f ON f.product_id = p.id
      WHERE p.category_id = ? AND p.id != ? AND p.is_active = 1
        AND EXISTS (SELECT 1 FROM product_fitment g WHERE g.product_id = ? AND g.make = f.make AND g.model = f.model)
      LIMIT 6`).all(row.category_id, row.id, row.id);
    const sameCat = db.prepare(`SELECT ${PRODUCT_COLUMNS} FROM products p JOIN categories c ON c.id = p.category_id
      WHERE p.category_id = ? AND p.id != ? AND p.is_active = 1 ORDER BY p.stock > 0 DESC, p.id LIMIT 6`).all(row.category_id, row.id);
    const alsoBought = db.prepare(`SELECT ${PRODUCT_COLUMNS}, COUNT(*) AS n FROM order_items a
      JOIN order_items b ON b.order_id = a.order_id AND b.product_id != a.product_id
      JOIN products p ON p.id = b.product_id JOIN categories c ON c.id = p.category_id
      WHERE a.product_id = ? AND p.is_active = 1 GROUP BY p.id ORDER BY n DESC LIMIT 4`).all(row.id);
    const pick = (list, n) => list.filter((x) => !seen.has(x.id) && seen.add(x.id)).slice(0, n);
    res.json({
      // Vehicle-specific parts only get alternates that fit the same vehicle. Same-category padding is for universal parts.
      alternates: [...alternates, ...pick(row.is_universal ? [...sameFit, ...sameCat] : sameFit, Math.max(0, 4 - alternates.length))].map((x) => toProduct(x)),
      alsoBought: pick(alsoBought, 4).map((x) => toProduct(x))
    });
  });

  r.get('/products/:key/reviews', (req, res) => {
    const row = findProduct(req.params.key);
    if (!row) throw notFound('We could not find that part');
    const reviews = db.prepare(`SELECT r.id, r.rating, r.title, r.body, r.created_at, u.name FROM reviews r
      JOIN users u ON u.id = r.user_id WHERE r.product_id = ? ORDER BY r.created_at DESC, r.id DESC`).all(row.id)
      .map((x) => ({ id: x.id, rating: x.rating, title: x.title, body: x.body, author: x.name.split(' ')[0], createdAt: x.created_at }));
    let canReview = false;
    if (req.user) {
      const bought = db.prepare(`SELECT 1 FROM order_items i JOIN orders o ON o.id = i.order_id
        WHERE o.user_id = ? AND i.product_id = ? AND o.status IN ('paid','processing','shipped','delivered')`).get(req.user.id, row.id);
      const done = db.prepare('SELECT 1 FROM reviews WHERE user_id = ? AND product_id = ?').get(req.user.id, row.id);
      canReview = !!bought && !done;
    }
    res.json({ reviews, canReview });
  });

  const reviewSchema = z.object({
    rating: z.coerce.number().int().min(1, 'Choose a rating').max(5, 'Choose a rating'),
    title: z.string().trim().max(100).default(''),
    body: z.string().trim().max(2000).default('')
  });

  r.post('/products/:key/reviews', requireUser, wrap(async (req, res) => {
    const row = findProduct(req.params.key);
    if (!row) throw notFound('We could not find that part');
    const body = parse(reviewSchema, req.body);
    const bought = db.prepare(`SELECT 1 FROM order_items i JOIN orders o ON o.id = i.order_id
      WHERE o.user_id = ? AND i.product_id = ? AND o.status IN ('paid','processing','shipped','delivered')`).get(req.user.id, row.id);
    if (!bought) throw forbidden('Only customers who bought this part can review it');
    if (db.prepare('SELECT 1 FROM reviews WHERE user_id = ? AND product_id = ?').get(req.user.id, row.id)) throw conflict('You have already reviewed this part');
    db.prepare('INSERT INTO reviews (product_id, user_id, rating, title, body) VALUES (?, ?, ?, ?, ?)').run(row.id, req.user.id, body.rating, body.title, body.body);
    res.status(201).json({ ok: true });
  }));

  return r;
}
