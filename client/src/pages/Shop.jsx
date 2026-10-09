import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { vehicleLabel } from '../format.js';
import { useStore } from '../store.jsx';
import { useSeo } from '../seo.js';
import ProductCard from '../components/ProductCard.jsx';
import { Empty, Notice, Spinner } from '../components/ui.jsx';

export default function Shop() {
  const [sp, setSp] = useSearchParams();
  const { garage } = useStore();
  const [cats, setCats] = useState([]);
  const [brands, setBrands] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [min, setMin] = useState(sp.get('minPrice') ? String(Number(sp.get('minPrice')) / 100) : '');
  const [max, setMax] = useState(sp.get('maxPrice') ? String(Number(sp.get('maxPrice')) / 100) : '');

  const q = sp.get('q') || '';
  const category = sp.get('category') || '';
  const fit = sp.get('fit') === '1' && !!garage;
  const page = Number(sp.get('page') || 1);
  const catName = cats.find((c) => c.slug === category)?.name;

  useSeo({
    title: q ? `Search: ${q}` : catName ? `${catName}${fit ? ` for ${garage.model}` : ''}` : 'All parts',
    description: catName ? `Shop ${catName.toLowerCase()} for your car. Filter by make, model and year.` : 'Browse every part in the Axle & Co. catalogue.'
  });

  useEffect(() => { api('/categories').then((r) => setCats(r.categories)); api('/brands').then((r) => setBrands(r.brands)); }, []);

  const params = useMemo(() => {
    const p = Object.fromEntries(sp.entries());
    delete p.fit;
    if (fit) Object.assign(p, { make: garage.make, model: garage.model, year: garage.year });
    return { limit: 12, ...p };
  }, [sp, fit, garage]);

  useEffect(() => {
    let live = true;
    setData(null); setError('');
    api('/products', { params }).then((r) => live && setData(r)).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [params]);

  const set = (key, value) => {
    const next = new URLSearchParams(sp);
    if (value === '' || value == null || value === false) next.delete(key); else next.set(key, value);
    if (key !== 'page') next.delete('page');
    setSp(next);
  };
  const applyPrice = (e) => {
    e.preventDefault();
    const next = new URLSearchParams(sp);
    min ? next.set('minPrice', Math.round(Number(min) * 100)) : next.delete('minPrice');
    max ? next.set('maxPrice', Math.round(Number(max) * 100)) : next.delete('maxPrice');
    next.delete('page');
    setSp(next);
  };
  const clear = () => { setSp(q ? { q } : {}); setMin(''); setMax(''); };
  const activeFilters = ['category', 'brand', 'minPrice', 'maxPrice', 'inStock', 'onSale', 'isNew', 'fit'].filter((k) => sp.get(k));

  return (
    <div className="wrap shop">
      <aside className="filters">
        <details open>
          <summary>Filters {activeFilters.length > 0 && <span className="pill">{activeFilters.length}</span>}</summary>

          <fieldset>
            <legend>My car</legend>
            {garage ? (
              <label className="check"><input type="checkbox" checked={fit} onChange={(e) => set('fit', e.target.checked ? '1' : '')} /> Only parts for my {vehicleLabel(garage)}</label>
            ) : <p className="muted small">Add your car from the header to see only parts that fit.</p>}
          </fieldset>

          <fieldset>
            <legend>Category</legend>
            <ul className="plain">
              <li><button className={`link-btn ${!category ? 'on' : ''}`} onClick={() => set('category', '')}>All categories</button></li>
              {cats.map((c) => <li key={c.id}><button className={`link-btn ${category === c.slug ? 'on' : ''}`} onClick={() => set('category', c.slug)}>{c.name}</button></li>)}
            </ul>
          </fieldset>

          <fieldset>
            <legend>Brand</legend>
            <select value={sp.get('brand') || ''} onChange={(e) => set('brand', e.target.value)} aria-label="Brand">
              <option value="">All brands</option>
              {brands.map((b) => <option key={b}>{b}</option>)}
            </select>
          </fieldset>

          <fieldset>
            <legend>Price</legend>
            <form className="price-range" onSubmit={applyPrice}>
              <input inputMode="numeric" placeholder="Min" aria-label="Minimum price" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ''))} />
              <span>to</span>
              <input inputMode="numeric" placeholder="Max" aria-label="Maximum price" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))} />
              <button className="btn small" type="submit">Go</button>
            </form>
          </fieldset>

          <fieldset>
            <legend>Availability</legend>
            <label className="check"><input type="checkbox" checked={sp.get('inStock') === '1'} onChange={(e) => set('inStock', e.target.checked ? '1' : '')} /> In stock only</label>
            <label className="check"><input type="checkbox" checked={sp.get('onSale') === '1'} onChange={(e) => set('onSale', e.target.checked ? '1' : '')} /> On sale</label>
            <label className="check"><input type="checkbox" checked={sp.get('isNew') === '1'} onChange={(e) => set('isNew', e.target.checked ? '1' : '')} /> New arrivals</label>
          </fieldset>

          {activeFilters.length > 0 && <button className="link" onClick={clear}>Clear all filters</button>}
        </details>
      </aside>

      <section className="results" aria-live="polite">
        <div className="results-head">
          <div>
            <h1>{q ? `Results for “${q}”` : catName || 'All parts'}</h1>
            {data && <p className="muted">{data.total} {data.total === 1 ? 'part' : 'parts'}{fit ? ` for your ${vehicleLabel(garage)}` : ''}</p>}
          </div>
          <label className="sort">Sort by
            <select value={sp.get('sort') || 'relevance'} onChange={(e) => set('sort', e.target.value === 'relevance' ? '' : e.target.value)}>
              <option value="relevance">{q ? 'Best match' : 'Featured'}</option>
              <option value="price_asc">Price, low to high</option>
              <option value="price_desc">Price, high to low</option>
              <option value="newest">Newest</option>
              <option value="name">Name</option>
            </select>
          </label>
        </div>

        {error && <Notice kind="error">{error}</Notice>}
        {!data && !error && <Spinner />}
        {data && data.products.length === 0 && (
          <Empty title="No parts match">
            <p>{q ? `Nothing found for “${q}”. Check the spelling or try a part number, brand or a simpler word like “brake” or “battery”.` : 'Try removing a filter.'}</p>
            {activeFilters.length > 0 && <button className="btn" onClick={clear}>Clear filters</button>}
          </Empty>
        )}
        {data && data.products.length > 0 && (
          <>
            <div className="grid">{data.products.map((p) => <ProductCard key={p.id} product={p} showFit={fit} />)}</div>
            {data.pages > 1 && (
              <nav className="pager" aria-label="Pagination">
                <button className="btn" disabled={page <= 1} onClick={() => { set('page', page - 1); window.scrollTo({ top: 0 }); }}>Previous</button>
                <span>Page {page} of {data.pages}</span>
                <button className="btn" disabled={page >= data.pages} onClick={() => { set('page', page + 1); window.scrollTo({ top: 0 }); }}>Next</button>
              </nav>
            )}
          </>
        )}
        {!garage && data?.products.length > 0 && <p className="muted small"><Link to="/">Add your car</Link> to see which of these parts fit.</p>}
      </section>
    </div>
  );
}
