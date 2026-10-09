import { useEffect } from 'react';

/** Sets the page title, description, canonical link and optional JSON-LD for search engines. */
export function useSeo({ title, description, jsonLd, canonical }) {
  useEffect(() => {
    document.title = title ? `${title} | Axle & Co.` : 'Axle & Co. | Car parts that fit your car';
    const set = (sel, create, attrs) => {
      let el = document.head.querySelector(sel);
      if (!el) { el = document.createElement(create); document.head.appendChild(el); }
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      return el;
    };
    if (description) set('meta[name="description"]', 'meta', { name: 'description', content: description });
    set('link[rel="canonical"]', 'link', { rel: 'canonical', href: canonical || window.location.origin + window.location.pathname });
    let ld = document.getElementById('ld-json');
    if (jsonLd) {
      if (!ld) { ld = document.createElement('script'); ld.id = 'ld-json'; ld.type = 'application/ld+json'; document.head.appendChild(ld); }
      ld.textContent = JSON.stringify(jsonLd);
    } else ld?.remove();
    return () => document.getElementById('ld-json')?.remove();
  }, [title, description, canonical, JSON.stringify(jsonLd)]); // eslint-disable-line react-hooks/exhaustive-deps
}
