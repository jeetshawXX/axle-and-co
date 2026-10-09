import { badRequest } from '../errors.js';
import { effectivePrice } from './products.js';

/**
 * Prices a basket. Used by the cart page (public), and re-run on the server
 * during checkout so the client can never dictate prices or totals.
 */
export function quote({ db, config }, { items, couponCode, shippingMethod = 'standard' }) {
  if (!['standard', 'express'].includes(shippingMethod)) throw badRequest('Unknown shipping method');
  const byId = new Map();
  for (const it of items) byId.set(it.productId, (byId.get(it.productId) || 0) + it.qty);

  const get = db.prepare(
    'SELECT id, sku, name, brand, image, price_cents, sale_price_cents, stock, weight_kg FROM products WHERE id = ? AND is_active = 1'
  );
  const lines = [];
  const issues = [];
  for (const [productId, qty] of byId) {
    const p = get.get(productId);
    if (!p) { issues.push({ productId, code: 'unavailable', message: 'This item is no longer available' }); continue; }
    const unit = effectivePrice(p);
    if (p.stock < qty) {
      issues.push({
        productId, code: p.stock === 0 ? 'out_of_stock' : 'insufficient_stock',
        message: p.stock === 0 ? `${p.name} is out of stock` : `Only ${p.stock} of ${p.name} left`, available: p.stock
      });
    }
    lines.push({
      productId: p.id, sku: p.sku, name: p.name, brand: p.brand, image: p.image,
      qty, unitPriceCents: unit, lineTotalCents: unit * qty, stock: p.stock
    });
  }

  const subtotal = lines.reduce((s, l) => s + l.lineTotalCents, 0);

  let discount = 0;
  let coupon = null;
  let couponError = null;
  if (couponCode) {
    const c = db.prepare('SELECT * FROM coupons WHERE code = ? AND is_active = 1').get(couponCode.trim());
    if (!c) couponError = 'That code is not valid';
    else if (c.expires_at && new Date(c.expires_at) < new Date()) couponError = 'That code has expired';
    else if (subtotal < c.min_subtotal_cents) {
      couponError = `Spend at least ${(c.min_subtotal_cents / 100).toLocaleString(config.locale, { style: 'currency', currency: config.currency, maximumFractionDigits: 0 })} to use this code`;
    } else {
      coupon = { code: c.code.toUpperCase(), percentOff: c.percent_off };
      discount = Math.round((subtotal * c.percent_off) / 100);
    }
  }

  const afterDiscount = subtotal - discount;
  let shipping = 0;
  if (lines.length) {
    if (shippingMethod === 'express') shipping = config.shippingExpressCents;
    else shipping = afterDiscount >= config.freeShippingOverCents ? 0 : config.shippingStandardCents;
  }
  const tax = Math.round(afterDiscount * config.taxRate);
  const total = afterDiscount + shipping + tax;
  const weightKg = lines.reduce((s, l) => s + (get.get(l.productId)?.weight_kg || 0) * l.qty, 0);

  return {
    lines, issues, coupon, couponError, shippingMethod,
    subtotalCents: subtotal, discountCents: discount, shippingCents: shipping,
    taxCents: tax, totalCents: total, weightKg,
    freeShippingOverCents: config.freeShippingOverCents,
    currency: config.currency
  };
}
