import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, GOOD_CARD, ADDRESS } from './helpers.js';
import { luhn } from '../src/services/payments.js';

let t;
before(async () => { t = await startApp(); });
after(async () => { await t.close(); });

const stockOf = (sku) => t.db.prepare('SELECT stock FROM products WHERE sku = ?').get(sku).stock;
const idOf = (sku) => t.db.prepare('SELECT id FROM products WHERE sku = ?').get(sku).id;
async function newUser(name = 'New Shopper') {
  const email = `u${Math.random().toString(36).slice(2, 8)}@example.test`;
  const r = await t.post('/api/auth/register', { name, email, password: 'Passw0rd!' });
  assert.equal(r.status, 201);
  return { token: r.body.token, email };
}
async function addToCart(token, sku, qty) {
  return t.put('/api/cart/items', { productId: idOf(sku), qty }, token);
}
const checkout = (token, extra = {}) => t.post('/api/orders', { shippingAddress: ADDRESS, shippingMethod: 'standard', card: GOOD_CARD, ...extra }, token);

// ---------------------------------------------------------------- auth
test('register, login and /me work; duplicate email is rejected', async () => {
  const { token, email } = await newUser();
  const me = await t.get('/api/auth/me', { token });
  assert.equal(me.body.user.email, email);
  assert.equal((await t.post('/api/auth/register', { name: 'Dup', email, password: 'Passw0rd!' })).status, 409);
  assert.equal((await t.post('/api/auth/login', { email, password: 'wrong-password' })).status, 401);
  assert.equal((await t.post('/api/auth/login', { email, password: 'Passw0rd!' })).status, 200);
});

test('registration validates input', async () => {
  const r = await t.post('/api/auth/register', { name: 'A', email: 'not-an-email', password: 'short' });
  assert.equal(r.status, 400);
  assert.ok(r.body.error);
});

test('protected routes require sign-in; admin routes require the admin role', async () => {
  assert.equal((await t.get('/api/cart')).status, 401);
  const customer = await t.customerToken();
  assert.equal((await t.get('/api/admin/stats', { token: customer })).status, 403);
  assert.equal((await t.get('/api/admin/stats')).status, 401);
  assert.equal((await t.get('/api/admin/stats', { token: await t.adminToken() })).status, 200);
});

// ---------------------------------------------------------------- catalogue and search
test('catalogue lists categories, vehicles and paginated products', async () => {
  assert.equal((await t.get('/api/categories')).body.categories.length, 9);
  const vehicles = (await t.get('/api/vehicles')).body.makes;
  assert.ok(vehicles.find((m) => m.make === 'Hyundai').models.some((m) => m.model === 'Creta'));
  const page = (await t.get('/api/products?limit=5&page=2')).body;
  assert.equal(page.products.length, 5);
  assert.ok(page.total > 100 && page.pages > 1);
});

test('fitment filter returns only parts that fit the chosen vehicle and year', async () => {
  const q = 'make=Maruti%20Suzuki&model=Swift&year=2016&category=brakes';
  const { products } = (await t.get(`/api/products?${q}`)).body;
  assert.ok(products.length >= 2);
  for (const p of products) assert.ok(p.sku.includes('SWF'), `${p.sku} should be a Swift part`);
  // Swift pads are split by generation: the 2019-2024 set must not show for a 2016 car
  assert.ok(products.some((p) => p.sku === 'BRK-SWF-F1'));
  assert.ok(!products.some((p) => p.sku === 'BRK-SWF-F2'));
  const later = (await t.get('/api/products?make=Maruti%20Suzuki&model=Swift&year=2022&category=brakes')).body.products;
  assert.ok(later.some((p) => p.sku === 'BRK-SWF-F2') && !later.some((p) => p.sku === 'BRK-SWF-F1'));
  // a year outside the model's run returns nothing vehicle-specific
  const none = (await t.get('/api/products?make=Maruti%20Suzuki&model=Swift&year=2005&category=brakes')).body.products;
  assert.equal(none.length, 0);
});

test('universal parts fit every vehicle; product page reports fit', async () => {
  const list = (await t.get('/api/products?make=Honda&model=City&year=2020&category=tools')).body.products;
  assert.ok(list.length >= 5);
  const fits = (await t.get('/api/products/BRK-CRT-F1?make=Honda&model=City&year=2016')).body.product;
  assert.equal(fits.fits, false);
  assert.equal((await t.get('/api/products/BRK-CRT-F1?make=Hyundai&model=Creta&year=2016')).body.product.fits, true);
  assert.equal((await t.get('/api/products/BRK-CRT-F1?make=Hyundai&model=Creta&year=2010')).body.product.fits, false);
});

test('search understands synonyms, stems and part numbers', async () => {
  const titles = async (q) => (await t.get(`/api/products?q=${encodeURIComponent(q)}&limit=60`)).body.products;
  const tyres = await titles('tyre');           // UK spelling -> tire
  assert.ok(tyres.length > 0 && tyres.every((p) => p.category.slug === 'tires-wheels' || /tire|tyre/i.test(p.name + p.description)));
  assert.ok((await titles('brakes')).some((p) => p.category.slug === 'brakes'));
  const exact = await titles('SR-CRT1F');        // part number
  assert.equal(exact[0].sku, 'BRK-CRT-F1');
  assert.ok((await titles('bat')).some((p) => p.category.slug === 'batteries')); // prefix
  assert.ok((await titles('wiper')).length >= 2);
});

test('search relaxes to any-word matching instead of returning an empty page', async () => {
  const r = (await t.get('/api/products?q=brake%20zzzunknownword')).body;
  assert.ok(r.products.length > 0);
});

test('search suggestions, sorting, price and stock filters', async () => {
  const s = (await t.get('/api/products/suggest?q=oil')).body.suggestions;
  assert.ok(s.length > 0 && s.length <= 6);
  const asc = (await t.get('/api/products?sort=price_asc&limit=20')).body.products.map((p) => p.priceCents);
  assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
  const range = (await t.get('/api/products?minPrice=100000&maxPrice=200000&limit=60')).body.products;
  assert.ok(range.every((p) => p.priceCents >= 100000 && p.priceCents <= 200000));
  assert.ok((await t.get('/api/products?inStock=1&limit=60')).body.products.every((p) => p.inStock));
  assert.ok((await t.get('/api/products?onSale=1&limit=60')).body.products.every((p) => p.onSale));
});

test('product page returns specs, fitment and related parts', async () => {
  const p = (await t.get('/api/products/BRK-SWF-F1')).body.product;
  assert.ok(p.specs.Material);
  assert.ok(p.fitment.some((f) => f.model === 'Swift'));
  const rel = (await t.get('/api/products/BRK-SWF-F1/related')).body;
  assert.ok(rel.alternates.some((a) => a.sku === 'BRK-SWF-ECO'), 'economy pad is a linked alternate');
  assert.ok(rel.alternates.every((a) => a.sku.includes('SWF') || a.isUniversal), 'alternates for a Swift part never come from other cars');
  const uni = (await t.get('/api/products/TLS-JACK-2T/related')).body;
  assert.ok(uni.alternates.length > 0, 'universal parts still get same-category suggestions');
  assert.equal((await t.get('/api/products/NOPE-123')).status, 404);
});

// ---------------------------------------------------------------- cart and pricing
test('cart persists server-side and merges a guest cart', async () => {
  const { token } = await newUser();
  await addToCart(token, 'FLT-SWF-OIL', 2);
  await t.post('/api/cart/merge', { items: [{ productId: idOf('FLT-SWF-OIL'), qty: 1 }, { productId: idOf('FLT-SWF-AIR'), qty: 1 }] }, token);
  const cart = (await t.get('/api/cart', { token })).body;
  const qty = Object.fromEntries(cart.items.map((i) => [i.productId, i.qty]));
  assert.equal(qty[idOf('FLT-SWF-OIL')], 2, 'larger quantity wins');
  assert.equal(qty[idOf('FLT-SWF-AIR')], 1);
  // "next session": a fresh login sees the same cart
  assert.equal((await t.get('/api/cart', { token })).body.items.length, 2);
  const del = await t.call('DELETE', `/api/cart/items/${idOf('FLT-SWF-AIR')}`, { token });
  assert.equal(del.body.items.length, 1);
});

test('quote computes discount, shipping and GST on the server', async () => {
  const id = idOf('TLS-JACK-2T');
  const q = (await t.post('/api/pricing/quote', { items: [{ productId: id, qty: 1 }], couponCode: 'welcome10' })).body.quote;
  assert.equal(q.coupon.code, 'WELCOME10');
  assert.equal(q.discountCents, Math.round(q.subtotalCents * 0.1));
  const after = q.subtotalCents - q.discountCents;
  assert.equal(q.taxCents, Math.round(after * 0.18));
  assert.equal(q.totalCents, after + q.shippingCents + q.taxCents);
  const big = (await t.post('/api/pricing/quote', { items: [{ productId: id, qty: 3 }] })).body.quote;
  assert.equal(big.shippingCents, 0, 'free shipping over the threshold');
  const bad = (await t.post('/api/pricing/quote', { items: [{ productId: id, qty: 1 }], couponCode: 'MONSOON15' })).body.quote;
  assert.ok(bad.couponError);
  assert.equal((await t.post('/api/pricing/quote', { items: [{ productId: id, qty: 1 }], shippingMethod: 'express' })).body.quote.shippingCents, t.config.shippingExpressCents);
});

// ---------------------------------------------------------------- checkout and orders
test('checkout with a valid card creates a paid order, decrements stock, clears the cart and emails receipts', async () => {
  const { token, email } = await newUser('Receipt Buyer');
  const before = stockOf('FLT-SWF-OIL');
  await addToCart(token, 'FLT-SWF-OIL', 2);
  const res = await checkout(token, { couponCode: 'WELCOME10' });
  assert.equal(res.status, 201, res.text);
  const order = res.body.order;
  assert.equal(order.status, 'paid');
  assert.equal(order.paymentStatus, 'paid');
  assert.equal(order.cardLast4, '4242');
  assert.equal(order.items[0].qty, 2);
  assert.equal(stockOf('FLT-SWF-OIL'), before - 2);
  assert.equal((await t.get('/api/cart', { token })).body.items.length, 0);
  const mails = t.app.locals.mailer.sent.filter((m) => m.subject.includes(order.number));
  assert.ok(mails.some((m) => m.to === email), 'customer receipt sent');
  assert.ok(mails.some((m) => m.to === t.config.merchantEmail), 'merchant notification sent');
  assert.ok(!JSON.stringify(order).includes('4242424242424242'), 'full card number is never stored');
  const list = (await t.get('/api/orders', { token })).body.orders;
  assert.equal(list[0].number, order.number);
});

test('declined card cancels the order and gives the stock back', async () => {
  const { token } = await newUser();
  const before = stockOf('FLT-SWF-AIR');
  await addToCart(token, 'FLT-SWF-AIR', 1);
  const res = await checkout(token, { card: { ...GOOD_CARD, number: '4000 0000 0000 0002' } });
  assert.equal(res.status, 402);
  assert.match(res.body.error, /declined/i);
  assert.equal(stockOf('FLT-SWF-AIR'), before);
  assert.equal((await t.get('/api/cart', { token })).body.items.length, 1, 'cart is kept so the shopper can retry');
});

test('invalid card details and address are rejected with clear messages', async () => {
  const { token } = await newUser();
  await addToCart(token, 'FLT-SWF-AIR', 1);
  assert.match((await checkout(token, { card: { ...GOOD_CARD, number: '4242 4242 4242 4241' } })).body.error, /not valid/i);
  assert.match((await checkout(token, { card: { ...GOOD_CARD, expiry: '01/20' } })).body.error, /expired/i);
  const bad = await checkout(token, { shippingAddress: { ...ADDRESS, postalCode: '!' } });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.details['shippingAddress.postalCode']);
});

test('cannot buy more than is in stock, and two buyers cannot take the last unit', async () => {
  t.db.prepare("UPDATE products SET stock = 1 WHERE sku = 'TLS-GAUGE'").run();
  const a = await newUser(); const b = await newUser();
  await addToCart(a.token, 'TLS-GAUGE', 1);
  await addToCart(b.token, 'TLS-GAUGE', 1);
  const [ra, rb] = await Promise.all([checkout(a.token), checkout(b.token)]);
  assert.deepEqual([ra.status, rb.status].sort(), [201, 409]);
  assert.equal(stockOf('TLS-GAUGE'), 0);
  const c = await newUser(); await addToCart(c.token, 'TLS-GAUGE', 1);
  assert.equal((await checkout(c.token)).status, 409);
});

test('customers can only see their own orders', async () => {
  const a = await newUser(); const b = await newUser();
  await addToCart(a.token, 'WPR-GLASS', 1);
  const { number } = (await checkout(a.token)).body.order;
  assert.equal((await t.get(`/api/orders/${number}`, { token: a.token })).status, 200);
  assert.equal((await t.get(`/api/orders/${number}`, { token: b.token })).status, 403);
  assert.equal((await t.get(`/api/orders/${number}`, { token: await t.adminToken() })).status, 200);
});

test('customer can cancel before shipping: stock restored, refunded', async () => {
  const { token } = await newUser();
  const before = stockOf('WPR-GLASS');
  await addToCart(token, 'WPR-GLASS', 2);
  const { number } = (await checkout(token)).body.order;
  assert.equal(stockOf('WPR-GLASS'), before - 2);
  const c = await t.post(`/api/orders/${number}/cancel`, {}, token);
  assert.equal(c.body.order.status, 'cancelled');
  assert.equal(c.body.order.paymentStatus, 'refunded');
  assert.equal(stockOf('WPR-GLASS'), before);
  assert.equal((await t.post(`/api/orders/${number}/cancel`, {}, token)).status, 409);
});

// ---------------------------------------------------------------- fulfilment, reviews
test('admin moves an order through processing, shipped (with tracking) and delivered', async () => {
  const admin = await t.adminToken();
  const { token, email } = await newUser();
  await addToCart(token, 'WPR-MICROFIBER', 1);
  const { number } = (await checkout(token)).body.order;
  assert.equal((await t.patch(`/api/admin/orders/${number}`, { status: 'shipped' }, admin)).status, 409, 'cannot skip a step');
  assert.equal((await t.patch(`/api/admin/orders/${number}`, { status: 'processing' }, admin)).body.order.status, 'processing');
  assert.equal((await t.patch(`/api/admin/orders/${number}`, { status: 'shipped' }, admin)).status, 400, 'needs tracking');
  const shipped = await t.patch(`/api/admin/orders/${number}`, { status: 'shipped', carrier: 'Blue Dart', trackingNumber: 'BD123456' }, admin);
  assert.equal(shipped.body.order.trackingNumber, 'BD123456');
  assert.ok(t.app.locals.mailer.sent.some((m) => m.to === email && /shipped/i.test(m.subject)));
  assert.equal((await t.patch(`/api/admin/orders/${number}`, { status: 'delivered' }, admin)).body.order.status, 'delivered');
  const events = (await t.get(`/api/orders/${number}`, { token })).body.order.events.map((e) => e.status);
  assert.deepEqual(events, ['pending_payment', 'paid', 'processing', 'shipped', 'delivered']);
});

test('only verified buyers can review, once per product', async () => {
  const { token } = await newUser();
  assert.equal((await t.post('/api/products/WPR-GLASS/reviews', { rating: 5 }, token)).status, 403);
  await addToCart(token, 'WPR-GLASS', 1);
  await checkout(token);
  assert.equal((await t.get('/api/products/WPR-GLASS/reviews', { token })).body.canReview, true);
  assert.equal((await t.post('/api/products/WPR-GLASS/reviews', { rating: 4, title: 'Good', body: 'Works' }, token)).status, 201);
  assert.equal((await t.post('/api/products/WPR-GLASS/reviews', { rating: 5 }, token)).status, 409);
  assert.equal((await t.get('/api/products/WPR-GLASS')).body.product.reviewCount >= 1, true);
});

// ---------------------------------------------------------------- admin
test('admin product CRUD, validation and soft delete', async () => {
  const admin = await t.adminToken();
  const body = { sku: 'TEST-001', partNumber: 'T-1', name: 'Test Wiper Arm', brand: 'Clearview', categoryId: 9, priceCents: 50000, stock: 7, isUniversal: true,
    fitment: [], specs: { Length: '20 in' } };
  const created = await t.post('/api/admin/products', body, admin);
  assert.equal(created.status, 201, created.text);
  assert.equal((await t.post('/api/admin/products', body, admin)).status, 409, 'duplicate SKU');
  assert.equal((await t.post('/api/admin/products', { ...body, sku: 'TEST-002', salePriceCents: 99999999 }, admin)).status, 400, 'sale above list price');
  assert.ok((await t.get('/api/products?q=wiper%20arm')).body.products.some((p) => p.sku === 'TEST-001'), 'new product is searchable');
  const id = created.body.product.id;
  const upd = await t.put(`/api/admin/products/${id}`, { ...body, name: 'Test Wiper Arm Renamed', priceCents: 45000 }, admin);
  assert.equal(upd.body.product.priceCents, 45000);
  assert.ok((await t.get('/api/products?q=renamed')).body.products.some((p) => p.sku === 'TEST-001'), 'search index follows edits');
  assert.equal((await t.patch(`/api/admin/products/${id}/stock`, { stock: -1 }, admin)).status, 400);
  assert.equal((await t.patch(`/api/admin/products/${id}/stock`, { stock: 12 }, admin)).body.product.stock, 12);
  assert.equal((await t.call('DELETE', `/api/admin/products/${id}`, { token: admin })).status, 200);
  assert.equal((await t.get('/api/products/TEST-001')).status, 404);
});

test('admin dashboard stats, CSV export, supplier sync and coupons', async () => {
  const admin = await t.adminToken();
  const stats = (await t.get('/api/admin/stats', { token: admin })).body;
  assert.ok(stats.orders > 0 && stats.revenueCents > 0 && stats.topProducts.length > 0 && stats.byDay.length > 0);
  const csv = await t.get('/api/admin/reports/sales.csv', { token: admin });
  assert.match(csv.text, /^order,date,email/);
  const sync = await t.post('/api/admin/suppliers/1/sync', { items: [{ sku: 'FLT-SWF-OIL', stock: 77, costCents: 12345 }, { sku: 'NOT-A-SKU', stock: 1 }] }, admin);
  assert.equal(sync.body.updated, 1);
  assert.deepEqual(sync.body.unknown, ['NOT-A-SKU']);
  assert.equal(stockOf('FLT-SWF-OIL'), 77);
  assert.equal((await t.post('/api/admin/coupons', { code: 'DIWALI25', percentOff: 25 }, admin)).status, 201);
  const q = (await t.post('/api/pricing/quote', { items: [{ productId: idOf('TLS-JACK-2T'), qty: 1 }], couponCode: 'DIWALI25' })).body.quote;
  assert.equal(q.coupon.percentOff, 25);
  await t.patch('/api/admin/coupons/DIWALI25', { isActive: false }, admin);
  assert.ok((await t.post('/api/pricing/quote', { items: [{ productId: idOf('TLS-JACK-2T'), qty: 1 }], couponCode: 'DIWALI25' })).body.quote.couponError);
});

test('abandoned unpaid orders release their stock', async () => {
  const { token } = await newUser();
  await addToCart(token, 'TLS-DRAIN', 1);
  const user = t.db.prepare('SELECT id, email FROM users ORDER BY id DESC LIMIT 1').get();
  const before = stockOf('TLS-DRAIN');
  const number = t.app.locals.orders.createPending(user, { items: [{ productId: idOf('TLS-DRAIN'), qty: 1 }], shippingAddress: ADDRESS, shippingMethod: 'standard' });
  assert.equal(stockOf('TLS-DRAIN'), before - 1);
  t.db.prepare("UPDATE orders SET created_at = datetime('now', '-2 hours') WHERE number = ?").run(number);
  assert.equal(t.app.locals.orders.expireStale(30) >= 1, true);
  assert.equal(stockOf('TLS-DRAIN'), before);
});

// ---------------------------------------------------------------- misc
test('sitemap, robots and config endpoints', async () => {
  const s = await t.get('/sitemap.xml');
  assert.match(s.text, /<urlset/);
  assert.match(s.text, /\/parts\/BRK-SWF-F1/);
  assert.match((await t.get('/robots.txt')).text, /Disallow: \/admin/);
  assert.equal((await t.get('/api/config')).body.payments, 'mock');
  assert.equal((await t.get('/api/nope')).status, 404);
});

test('luhn helper', () => {
  assert.ok(luhn('4242424242424242'));
  assert.ok(!luhn('4242424242424241'));
});
