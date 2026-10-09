import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { money } from '../format.js';
import { useStore } from '../store.jsx';
import { useSeo } from '../seo.js';
import { Empty, Notice, Qty } from '../components/ui.jsx';

export const getCoupon = () => { try { return sessionStorage.getItem('axle.coupon') || ''; } catch { return ''; } };
export const saveCoupon = (c) => { try { c ? sessionStorage.setItem('axle.coupon', c) : sessionStorage.removeItem('axle.coupon'); } catch { /* ignore */ } };

export default function Cart() {
  useSeo({ title: 'Your cart' });
  const { items, setQty, user, ready } = useStore();
  const nav = useNavigate();
  const [coupon, setCoupon] = useState(getCoupon());
  const [input, setInput] = useState(getCoupon());
  const [quote, setQuote] = useState(null);
  const [couponMsg, setCouponMsg] = useState('');

  useEffect(() => {
    if (!items.length) { setQuote(null); return; }
    let live = true;
    api('/pricing/quote', { method: 'POST', body: { items, couponCode: coupon || undefined } }).then((r) => {
      if (!live) return;
      setQuote(r.quote);
      if (coupon && r.quote.couponError) { setCouponMsg(r.quote.couponError); saveCoupon(''); setCoupon(''); }
    });
    return () => { live = false; };
  }, [items, coupon]);

  if (!ready) return null;
  if (!items.length) {
    return (
      <div className="wrap section">
        <Empty title="Your cart is empty"><p>Add your car first and we will show you only parts that fit.</p><Link className="btn primary" to="/shop">Browse parts</Link></Empty>
      </div>
    );
  }

  const apply = (e) => {
    e.preventDefault(); setCouponMsg('');
    const code = input.trim();
    saveCoupon(code); setCoupon(code);
  };
  const blocked = !quote || quote.issues.length > 0;
  const toGo = quote ? Math.max(0, quote.freeShippingOverCents - (quote.subtotalCents - quote.discountCents)) : 0;

  return (
    <div className="wrap cart-page">
      <h1>Your cart</h1>
      <div className="cart-grid">
        <section aria-label="Items in your cart">
          {quote?.issues.map((i) => <Notice key={i.productId + i.code} kind="error">{i.message}. Lower the quantity or remove it to continue.</Notice>)}
          <ul className="lines">
            {(quote?.lines || []).map((l) => (
              <li key={l.productId} className="line">
                <img src={l.image} alt="" width="96" height="72" />
                <div className="line-info">
                  <Link to={`/parts/${encodeURIComponent(l.sku)}`}>{l.name}</Link>
                  <p className="muted small">{l.brand} · <span className="mono">{l.sku}</span></p>
                  <button className="link" onClick={() => setQty(l.productId, 0)}>Remove</button>
                </div>
                <Qty value={l.qty} max={Math.max(l.stock, 1)} onChange={(n) => setQty(l.productId, n)} label={`Quantity of ${l.name}`} />
                <p className="line-total">{money(l.lineTotalCents)}<small>{money(l.unitPriceCents)} each</small></p>
              </li>
            ))}
          </ul>
        </section>

        <aside className="summary" aria-label="Order summary">
          <h2>Summary</h2>
          {quote && (
            <>
              <dl className="totals">
                <div><dt>Subtotal</dt><dd>{money(quote.subtotalCents)}</dd></div>
                {quote.discountCents > 0 && <div className="good"><dt>Discount ({quote.coupon.code})</dt><dd>−{money(quote.discountCents)}</dd></div>}
                <div><dt>Shipping</dt><dd>{quote.shippingCents ? money(quote.shippingCents) : 'Free'}</dd></div>
                <div><dt>GST</dt><dd>{money(quote.taxCents)}</dd></div>
                <div className="grand"><dt>Total</dt><dd>{money(quote.totalCents)}</dd></div>
              </dl>
              {toGo > 0 && <p className="muted small">Add {money(toGo)} more for free standard shipping.</p>}
            </>
          )}
          <form className="coupon" onSubmit={apply}>
            <input placeholder="Discount code" aria-label="Discount code" value={input} onChange={(e) => setInput(e.target.value)} />
            <button className="btn" type="submit">Apply</button>
          </form>
          {couponMsg && <p className="error-text">{couponMsg}</p>}
          <button className="btn primary wide" disabled={blocked} onClick={() => nav(user ? '/checkout' : '/login?next=/checkout')}>
            {user ? 'Go to checkout' : 'Sign in to check out'}
          </button>
          {!user && <p className="muted small">Your cart is saved. It will be waiting for you after you sign in.</p>}
        </aside>
      </div>
    </div>
  );
}
