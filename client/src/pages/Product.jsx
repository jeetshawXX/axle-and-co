import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { dateOnly, money, vehicleLabel } from '../format.js';
import { useStore } from '../store.jsx';
import { useSeo } from '../seo.js';
import FitmentPicker from '../components/FitmentPicker.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { Empty, Notice, Qty, RatingInput, Spinner, Stars } from '../components/ui.jsx';

function Reviews({ sku, product, onChanged }) {
  const { user, notify } = useStore();
  const [data, setData] = useState(null);
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const load = () => api(`/products/${encodeURIComponent(sku)}/reviews`).then(setData);
  useEffect(() => { load(); }, [sku, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault(); setError('');
    try {
      await api(`/products/${encodeURIComponent(sku)}/reviews`, { method: 'POST', body: { rating, title, body } });
      notify('Thanks for your review'); setRating(0); setTitle(''); setBody(''); load(); onChanged();
    } catch (err) { setError(err.message); }
  };

  return (
    <section className="reviews" aria-labelledby="reviews-h">
      <h2 id="reviews-h">Reviews {product.reviewCount > 0 && <small>{product.rating} out of 5 from {product.reviewCount}</small>}</h2>
      {!data && <Spinner />}
      {data && data.reviews.length === 0 && <p className="muted">No reviews yet. Buyers of this part can leave the first one.</p>}
      {data?.reviews.map((r) => (
        <article key={r.id} className="review">
          <Stars value={r.rating} />
          <h4>{r.title || 'Review'}</h4>
          {r.body && <p>{r.body}</p>}
          <p className="muted small">{r.author}, verified buyer · {dateOnly(r.createdAt)}</p>
        </article>
      ))}
      {data?.canReview && (
        <form className="review-form" onSubmit={submit}>
          <h3>Review this part</h3>
          <RatingInput value={rating} onChange={setRating} />
          <input placeholder="Headline" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} aria-label="Review headline" />
          <textarea placeholder="What did you think?" rows="3" value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} aria-label="Review text" />
          {error && <Notice kind="error">{error}</Notice>}
          <button className="btn primary" disabled={!rating}>Post review</button>
        </form>
      )}
    </section>
  );
}

export default function Product() {
  const { sku } = useParams();
  const { garage, addToCart, items, setQty } = useStore();
  const [p, setP] = useState(null);
  const [rel, setRel] = useState({ alternates: [], alsoBought: [] });
  const [error, setError] = useState('');
  const [qty, setLocalQty] = useState(1);
  const [checking, setChecking] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    setP(null); setError(''); setLocalQty(1);
    const params = garage ? { make: garage.make, model: garage.model, year: garage.year } : undefined;
    api(`/products/${encodeURIComponent(sku)}`, { params }).then((r) => live && setP(r.product)).catch((e) => live && setError(e.message));
    api(`/products/${encodeURIComponent(sku)}/related`).then((r) => live && setRel(r)).catch(() => {});
    window.scrollTo({ top: 0 });
    return () => { live = false; };
  }, [sku, garage, nonce]);

  useSeo({
    title: p ? `${p.name} (${p.partNumber})` : 'Part',
    description: p ? `${p.name} by ${p.brand}. ${p.description}`.slice(0, 158) : undefined,
    jsonLd: p && {
      '@context': 'https://schema.org', '@type': 'Product', name: p.name, sku: p.sku, mpn: p.partNumber, brand: { '@type': 'Brand', name: p.brand },
      description: p.description, image: window.location.origin + p.image, category: p.category.name,
      ...(p.reviewCount ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: p.rating, reviewCount: p.reviewCount } } : {}),
      offers: { '@type': 'Offer', priceCurrency: 'INR', price: (p.priceCents / 100).toFixed(2), availability: p.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', url: window.location.href }
    }
  });

  if (error) return <div className="wrap section"><Empty title="Part not found"><p>{error}</p><Link className="btn" to="/shop">Browse all parts</Link></Empty></div>;
  if (!p) return <div className="wrap section"><Spinner /></div>;

  const inCart = items.find((i) => i.productId === p.id)?.qty || 0;
  const room = Math.max(0, p.stock - inCart);

  return (
    <div className="wrap product-page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/shop">Parts</Link> / <Link to={`/shop?category=${p.category.slug}`}>{p.category.name}</Link>
      </nav>

      <div className="product-top">
        <div className="gallery"><img src={p.image} alt={`${p.category.name} illustration`} width="640" height="480" /></div>

        <div className="buy">
          <p className="muted">{p.brand} · <span className="mono">{p.partNumber}</span> · SKU <span className="mono">{p.sku}</span></p>
          <h1>{p.name}</h1>
          {p.reviewCount > 0 && <p className="rating-line"><Stars value={p.rating} /> <a href="#reviews-h">{p.rating} ({p.reviewCount} reviews)</a></p>}

          <p className="price big">
            <strong>{money(p.priceCents)}</strong>
            {p.onSale && <><s>{money(p.listPriceCents)}</s><span className="save">Save {money(p.listPriceCents - p.priceCents)}</span></>}
          </p>
          <p className="muted small">GST is added at checkout.</p>

          <div className={`fit-box ${p.isUniversal ? 'universal' : p.fits === true ? 'yes' : p.fits === false ? 'no' : ''}`}>
            {p.isUniversal ? (
              <p><b>Universal fit.</b> Works on any car.</p>
            ) : garage ? (
              <>
                <p><b>{p.fits ? `Fits your ${vehicleLabel(garage)}` : `Does not fit your ${vehicleLabel(garage)}`}</b></p>
                {!p.fits && <p className="small"><Link to={`/shop?category=${p.category.slug}&fit=1`}>See {p.category.name.toLowerCase()} that do fit</Link></p>}
                <button className="link" onClick={() => setChecking((c) => !c)}>Check another car</button>
              </>
            ) : (
              <>
                <p><b>Check this part fits your car</b></p>
                <button className="link" onClick={() => setChecking((c) => !c)}>Choose make, model and year</button>
              </>
            )}
            {checking && <FitmentPicker compact submitLabel="Check fit" onDone={() => setChecking(false)} />}
          </div>

          {p.inStock ? (
            <p className={`stock ${p.lowStock ? 'low' : 'in'}`}>{p.lowStock ? `Only ${p.stock} left` : 'In stock'}</p>
          ) : <p className="stock out">Out of stock</p>}

          {p.inStock && (
            <div className="buy-row">
              <Qty value={Math.min(qty, Math.max(room, 1))} max={Math.max(room, 1)} onChange={(n) => setLocalQty(Math.max(1, n))} />
              <button className="btn primary wide" disabled={room === 0} onClick={() => addToCart(p, Math.min(qty, room))}>
                {room === 0 ? 'All available units are in your cart' : 'Add to cart'}
              </button>
            </div>
          )}
          {inCart > 0 && (
            <p className="muted small">{inCart} in your cart. <Link to="/cart">View cart</Link> · <button className="link" onClick={() => setQty(p.id, 0)}>Remove</button></p>
          )}
        </div>
      </div>

      <div className="product-detail">
        <section>
          <h2>About this part</h2>
          <p className="lead">{p.description}</p>
          <h3>Specifications</h3>
          <dl className="specs">
            {Object.entries(p.specs).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            <div><dt>Weight</dt><dd>{p.weightKg} kg</dd></div>
          </dl>
        </section>
        <section>
          <h2>Compatible vehicles</h2>
          {p.isUniversal ? <p>Universal. Fits any vehicle.</p> : (
            <table className="fit-table">
              <thead><tr><th>Make</th><th>Model</th><th>Years</th></tr></thead>
              <tbody>{p.fitment.map((f, i) => <tr key={i}><td>{f.make}</td><td>{f.model}</td><td>{f.yearFrom} to {f.yearTo}</td></tr>)}</tbody>
            </table>
          )}
        </section>
      </div>

      {rel.alternates.length > 0 && (
        <section className="section-tight">
          <h2>Alternative parts</h2>
          <div className="grid">{rel.alternates.map((a) => <ProductCard key={a.id} product={a} />)}</div>
        </section>
      )}
      {rel.alsoBought.length > 0 && (
        <section className="section-tight">
          <h2>Customers also bought</h2>
          <div className="grid">{rel.alsoBought.map((a) => <ProductCard key={a.id} product={a} />)}</div>
        </section>
      )}

      <Reviews sku={sku} product={p} onChanged={() => setNonce((n) => n + 1)} />
    </div>
  );
}
