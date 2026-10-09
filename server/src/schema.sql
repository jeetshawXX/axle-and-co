PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin')),
  phone TEXT,
  default_address TEXT,               -- JSON, last shipping address used
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  lead_time_days INTEGER NOT NULL DEFAULT 3,
  dropship INTEGER NOT NULL DEFAULT 0,
  contact_email TEXT
);

-- Vehicle catalogue used by the make / model / year selector.
CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year_from INTEGER NOT NULL,
  year_to INTEGER NOT NULL,
  UNIQUE (make, model)
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  part_number TEXT NOT NULL,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  supplier_id INTEGER REFERENCES suppliers(id),
  description TEXT NOT NULL DEFAULT '',
  specs TEXT NOT NULL DEFAULT '{}',          -- JSON object
  image TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  sale_price_cents INTEGER CHECK (sale_price_cents IS NULL OR sale_price_cents >= 0),
  cost_cents INTEGER NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  weight_kg REAL NOT NULL DEFAULT 1,
  is_universal INTEGER NOT NULL DEFAULT 0,   -- fits every vehicle
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);

CREATE TABLE IF NOT EXISTS product_fitment (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year_from INTEGER NOT NULL,
  year_to INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fitment_lookup ON product_fitment(make, model);
CREATE INDEX IF NOT EXISTS idx_fitment_product ON product_fitment(product_id);

-- Explicit "alternate part" links (e.g. economy vs premium pad set).
CREATE TABLE IF NOT EXISTS product_alternates (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  alternate_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, alternate_id)
);

-- Full-text index: stemming (brakes ~ brake) and prefix queries.
CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
  name, brand, part_number, sku, description,
  content='products', content_rowid='id', tokenize='porter unicode61'
);
CREATE TRIGGER IF NOT EXISTS products_ai AFTER INSERT ON products BEGIN
  INSERT INTO products_fts(rowid, name, brand, part_number, sku, description)
  VALUES (new.id, new.name, new.brand, new.part_number, new.sku, new.description);
END;
CREATE TRIGGER IF NOT EXISTS products_ad AFTER DELETE ON products BEGIN
  INSERT INTO products_fts(products_fts, rowid, name, brand, part_number, sku, description)
  VALUES ('delete', old.id, old.name, old.brand, old.part_number, old.sku, old.description);
END;
CREATE TRIGGER IF NOT EXISTS products_au AFTER UPDATE OF name, brand, part_number, sku, description ON products BEGIN
  INSERT INTO products_fts(products_fts, rowid, name, brand, part_number, sku, description)
  VALUES ('delete', old.id, old.name, old.brand, old.part_number, old.sku, old.description);
  INSERT INTO products_fts(rowid, name, brand, part_number, sku, description)
  VALUES (new.id, new.name, new.brand, new.part_number, new.sku, new.description);
END;

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (product_id, user_id)
);

-- Server-side cart: survives sessions and devices for signed-in users.
CREATE TABLE IF NOT EXISTS cart_items (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty INTEGER NOT NULL CHECK (qty > 0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS coupons (
  code TEXT PRIMARY KEY COLLATE NOCASE,
  percent_off INTEGER NOT NULL CHECK (percent_off BETWEEN 1 AND 90),
  min_subtotal_cents INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment','paid','processing','shipped','delivered','cancelled')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid','paid','failed','refunded','refund_pending')),
  payment_provider TEXT NOT NULL DEFAULT 'mock',
  payment_ref TEXT,
  card_last4 TEXT,
  subtotal_cents INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  shipping_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,
  coupon_code TEXT,
  shipping_method TEXT NOT NULL DEFAULT 'standard',
  shipping_address TEXT NOT NULL,            -- JSON
  email TEXT NOT NULL,
  carrier TEXT,
  tracking_number TEXT,
  affiliate_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0)
);

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
