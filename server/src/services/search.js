/**
 * "Intelligent" search on top of SQLite FTS5.
 *  - stemming (brakes ~ brake) comes from the porter tokenizer
 *  - prefix matching (bat -> battery) via the trailing *
 *  - a synonym table maps everyday words / common misspellings to catalogue terms
 *  - part numbers and SKUs are indexed, so "BP-1042" finds the exact part
 *  - ranking uses bm25 with heavier weight on name, part number and SKU
 */
const SYNONYMS = {
  tyre: ['tire'], tyres: ['tire'], tires: ['tire'], wheel: ['tire'],
  brake: ['brake', 'pad', 'rotor'], brakes: ['brake', 'pad', 'rotor'], pads: ['pad', 'brake'],
  bulb: ['bulb', 'headlight', 'lamp', 'led'], lamp: ['bulb', 'headlight', 'led'],
  headlamp: ['headlight'], light: ['light', 'bulb', 'led', 'lamp'], lights: ['light', 'bulb', 'led'],
  battery: ['battery', 'volt'], accumulator: ['battery'], cell: ['battery'],
  oil: ['oil', 'lubricant'], lube: ['oil'], engineoil: ['oil'],
  plug: ['spark', 'plug'], plugs: ['spark', 'plug'], sparkplug: ['spark', 'plug'],
  wiper: ['wiper', 'blade'], wipers: ['wiper', 'blade'],
  scanner: ['obd', 'scanner', 'diagnostic'], obd: ['obd', 'scanner'],
  camera: ['dash', 'cam', 'camera'], dashcam: ['dash', 'cam'],
  spanner: ['wrench', 'socket'], wrench: ['wrench', 'socket', 'spanner'],
  coolant: ['coolant', 'antifreeze'], antifreeze: ['coolant'],
  jack: ['jack', 'lift'], inflator: ['inflator', 'compressor', 'pump'], pump: ['inflator', 'compressor']
};

const tokenize = (q) =>
  String(q || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .slice(0, 8);

/** Builds an FTS5 MATCH expression. `mode` 'and' needs every word; 'or' needs any. */
export function buildMatch(q, mode = 'and') {
  const tokens = tokenize(q);
  if (!tokens.length) return null;
  const groups = tokens.map((t) => {
    const alts = new Set([t, ...(SYNONYMS[t] || [])]);
    return '(' + [...alts].map((a) => `${a}*`).join(' OR ') + ')';
  });
  return groups.join(mode === 'and' ? ' AND ' : ' OR ');
}

// Order of columns in products_fts: name, brand, part_number, sku, description
export const RANK_SQL = 'bm25(products_fts, 10.0, 4.0, 8.0, 8.0, 1.0)';

/** Tries a strict AND match first and relaxes to OR so a typo never yields an empty page. */
export function pickMatch(db, q, extraWhere = '1=1', extraParams = []) {
  const strict = buildMatch(q, 'and');
  if (!strict) return null;
  const probe = db.prepare(
    `SELECT 1 FROM products p JOIN products_fts ON products_fts.rowid = p.id
     WHERE products_fts MATCH ? AND p.is_active = 1 AND ${extraWhere} LIMIT 1`
  );
  if (probe.get(strict, ...extraParams)) return strict;
  return buildMatch(q, 'or');
}
