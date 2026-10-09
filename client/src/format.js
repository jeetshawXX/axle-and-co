let cfg = { currency: 'INR', locale: 'en-IN' };
export const setFormat = (c) => { cfg = { ...cfg, currency: c.currency, locale: c.locale }; };

export const money = (cents, { compact = false } = {}) =>
  (cents / 100).toLocaleString(cfg.locale, { style: 'currency', currency: cfg.currency, maximumFractionDigits: cents % 100 === 0 || compact ? 0 : 2 });

export const parseDate = (s) => new Date(String(s).replace(' ', 'T') + (String(s).endsWith('Z') ? '' : 'Z'));
export const dateTime = (s) => parseDate(s).toLocaleString(cfg.locale, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
export const dateOnly = (s) => parseDate(s).toLocaleDateString(cfg.locale, { day: 'numeric', month: 'short', year: 'numeric' });

export const STATUS_LABEL = {
  pending_payment: 'Waiting for payment', paid: 'Paid', processing: 'Preparing', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled'
};
export const vehicleLabel = (v) => (v ? `${v.make} ${v.model} ${v.year}` : '');
