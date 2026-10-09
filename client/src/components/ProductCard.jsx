import { Link } from 'react-router-dom';
import { money } from '../format.js';
import { useStore } from '../store.jsx';
import { Stars } from './ui.jsx';

export default function ProductCard({ product: p, showFit = false }) {
  const { addToCart, items } = useStore();
  const inCart = items.find((i) => i.productId === p.id)?.qty || 0;
  const maxed = inCart >= p.stock;
  return (
    <article className="card product-card">
      <Link to={`/parts/${encodeURIComponent(p.sku)}`} className="card-img" aria-hidden="true" tabIndex={-1}>
        <img src={p.image} alt="" loading="lazy" width="320" height="240" />
        {p.onSale && <span className="flag sale">Sale</span>}
        {!p.onSale && p.isNew && <span className="flag new">New</span>}
      </Link>
      <div className="card-body">
        <p className="eyebrow-less">{p.brand} · <span className="mono">{p.partNumber}</span></p>
        <h3><Link to={`/parts/${encodeURIComponent(p.sku)}`}>{p.name}</Link></h3>
        {p.rating && <p className="rating-line"><Stars value={p.rating} size={14} /> <span>({p.reviewCount})</span></p>}
        {showFit && p.fits && <p className="fit-ok">Fits your car</p>}
        {p.isUniversal && <p className="muted small">Universal fit</p>}
        <div className="card-foot">
          <p className="price">
            <strong>{money(p.priceCents)}</strong>
            {p.onSale && <s>{money(p.listPriceCents)}</s>}
          </p>
          {p.inStock ? (
            <button className="btn small" onClick={() => addToCart(p)} disabled={maxed} aria-label={`Add ${p.name} to cart`}>{maxed ? 'In cart' : 'Add'}</button>
          ) : <span className="stock out">Out of stock</span>}
        </div>
        {p.lowStock && <p className="stock low">Only {p.stock} left</p>}
      </div>
    </article>
  );
}
