/** Shared helpers for turning product rows into API objects. */
export const PRODUCT_COLUMNS = `p.id, p.sku, p.part_number, p.name, p.brand, p.description, p.specs, p.image,
  p.price_cents, p.sale_price_cents, p.stock, p.low_stock_threshold, p.weight_kg, p.is_universal,
  p.is_active, p.created_at, p.category_id, c.slug AS category_slug, c.name AS category_name`;

const THIRTY_DAYS = 30 * 24 * 3600 * 1000;

export function effectivePrice(p) {
  return p.sale_price_cents != null && p.sale_price_cents < p.price_cents ? p.sale_price_cents : p.price_cents;
}

export function toProduct(row, extras = {}) {
  const price = effectivePrice(row);
  const created = new Date(row.created_at.replace(' ', 'T') + 'Z').getTime();
  return {
    id: row.id,
    sku: row.sku,
    partNumber: row.part_number,
    name: row.name,
    brand: row.brand,
    description: row.description,
    specs: JSON.parse(row.specs || '{}'),
    image: row.image,
    category: { id: row.category_id, slug: row.category_slug, name: row.category_name },
    priceCents: price,
    listPriceCents: row.price_cents,
    onSale: price < row.price_cents,
    stock: row.stock,
    inStock: row.stock > 0,
    lowStock: row.stock > 0 && row.stock <= row.low_stock_threshold,
    isNew: Date.now() - created < THIRTY_DAYS,
    isUniversal: !!row.is_universal,
    weightKg: row.weight_kg,
    ...extras
  };
}

/** SQL fragment: does product `p` fit the given vehicle? Returns [sql, params]. */
export function fitSql(vehicle) {
  return [
    `(p.is_universal = 1 OR EXISTS (
        SELECT 1 FROM product_fitment f
        WHERE f.product_id = p.id AND f.make = ? AND f.model = ? AND ? BETWEEN f.year_from AND f.year_to))`,
    [vehicle.make, vehicle.model, vehicle.year]
  ];
}

export function fitsVehicle(db, productId, vehicle) {
  const [sql, params] = fitSql(vehicle);
  return !!db.prepare(`SELECT 1 FROM products p WHERE p.id = ? AND ${sql}`).get(productId, ...params);
}
