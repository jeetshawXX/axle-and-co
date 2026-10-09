import { Router } from 'express';

const xml = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

/** robots.txt and sitemap.xml so search engines can discover every category and product page. */
export function seoRoutes({ db, config }) {
  const r = Router();
  r.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nDisallow: /checkout\nDisallow: /account\nDisallow: /api/\nSitemap: ${config.publicUrl}/sitemap.xml\n`);
  });
  r.get('/sitemap.xml', (_req, res) => {
    const urls = ['/', '/shop'];
    for (const c of db.prepare('SELECT slug FROM categories').all()) urls.push(`/shop?category=${c.slug}`);
    for (const p of db.prepare('SELECT sku FROM products WHERE is_active = 1').all()) urls.push(`/parts/${encodeURIComponent(p.sku)}`);
    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls.map((u) => `  <url><loc>${xml(config.publicUrl + u)}</loc></url>`).join('\n') + `\n</urlset>\n`
    );
  });
  return r;
}
