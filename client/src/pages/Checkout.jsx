import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { money } from '../format.js';
import { useStore } from '../store.jsx';
import { useSeo } from '../seo.js';
import { Field, Notice } from '../components/ui.jsx';
import { getCoupon } from './Cart.jsx';

const blank = { fullName: '', phone: '', line1: '', line2: '', city: '', state: '', postalCode: '' };
const groupCard = (v) => v.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim();
const fmtExpiry = (v) => { const d = v.replace(/\D/g, '').slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d; };

export default function Checkout() {
  useSeo({ title: 'Checkout' });
  const { user, ready, items, config, clearLocalCart, notify } = useStore();
  const nav = useNavigate();
  const [addr, setAddr] = useState({ ...blank, ...(user?.defaultAddress || {}), fullName: user?.defaultAddress?.fullName || user?.name || '' });
  const [method, setMethod] = useState('standard');
  const [card, setCard] = useState({ name: '', number: '', expiry: '', cvc: '' });
  const [quote, setQuote] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [cardError, setCardError] = useState('');
  const [busy, setBusy] = useState(false);
  const placed = useRef(false);   // set once an order is placed, so the empty-cart redirect below cannot fire
  const coupon = getCoupon();

  useEffect(() => {
    if (!items.length) return;
    api('/pricing/quote', { method: 'POST', body: { items, couponCode: coupon || undefined, shippingMethod: method } }).then((r) => setQuote(r.quote));
  }, [items, method, coupon]);

  if (!ready) return null;
  if (!user) return <Navigate to="/login?next=/checkout" replace />;
  if (!items.length && !placed.current) return <Navigate to="/cart" replace />;

  const mock = config?.payments === 'mock';
  const setA = (k) => (e) => {
    setAddr((a) => ({ ...a, [k]: e.target.value }));
    setErrors((prev) => { if (!prev[k]) return prev; const { [k]: _gone, ...rest } = prev; return rest; });   // clear a field's error as soon as it is edited
  };

  const validate = () => {
    const e = {};
    if (addr.fullName.trim().length < 2) e.fullName = 'Enter the recipient name';
    if (!/^[0-9+\-\s()]{7,20}$/.test(addr.phone)) e.phone = 'Enter a valid phone number';
    if (addr.line1.trim().length < 3) e.line1 = 'Enter the street address';
    if (addr.city.trim().length < 2) e.city = 'Enter the city';
    if (addr.state.trim().length < 2) e.state = 'Enter the state';
    if (!/^[A-Za-z0-9\- ]{4,10}$/.test(addr.postalCode)) e.postalCode = 'Enter a valid postal code';
    return e;
  };

  const place = async (ev) => {
    ev.preventDefault();
    setFormError(''); setCardError('');
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) { document.getElementById('shipping-h')?.scrollIntoView({ behavior: 'smooth' }); return; }
    setBusy(true);
    try {
      let ref; try { ref = localStorage.getItem('axle.ref') || undefined; } catch { /* ignore */ }
      const res = await api('/orders', {
        method: 'POST',
        body: { shippingAddress: addr, shippingMethod: method, couponCode: coupon || undefined, affiliateRef: ref, ...(mock ? { card } : {}) }
      });
      if (res.redirectUrl) { window.location.href = res.redirectUrl; return; }
      placed.current = true;
      nav(`/order/${res.order.number}?placed=1`, { replace: true });
      clearLocalCart();
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) setCardError(err.message);
      else if (err instanceof ApiError && err.status === 400 && err.details && Object.keys(err.details).some((k) => k.startsWith('shippingAddress.'))) {
        setErrors(Object.fromEntries(Object.entries(err.details).map(([k, v]) => [k.replace('shippingAddress.', ''), v])));
      } else if (err.status === 400 && /card|expir|security|name on/i.test(err.message)) setCardError(err.message);
      else setFormError(err.message);
      if (err.status === 409) notify('Your cart changed. Please review it.', 'error');
    } finally { setBusy(false); }
  };

  return (
    <div className="wrap checkout-page">
      <h1>Checkout</h1>
      <form className="checkout-grid" onSubmit={place} noValidate>
        <div className="steps">
          <section className="panel" aria-labelledby="shipping-h">
            <h2 id="shipping-h">Delivery address</h2>
            <div className="form-grid">
              <Field label="Full name" error={errors.fullName} className="span2">{(p) => <input {...p} autoComplete="name" value={addr.fullName} onChange={setA('fullName')} />}</Field>
              <Field label="Phone" error={errors.phone}>{(p) => <input {...p} type="tel" autoComplete="tel" value={addr.phone} onChange={setA('phone')} />}</Field>
              <Field label="Postal code" error={errors.postalCode}>{(p) => <input {...p} autoComplete="postal-code" value={addr.postalCode} onChange={setA('postalCode')} />}</Field>
              <Field label="Address line 1" error={errors.line1} className="span2">{(p) => <input {...p} autoComplete="address-line1" value={addr.line1} onChange={setA('line1')} />}</Field>
              <Field label="Address line 2 (optional)" className="span2">{(p) => <input {...p} autoComplete="address-line2" value={addr.line2} onChange={setA('line2')} />}</Field>
              <Field label="City" error={errors.city}>{(p) => <input {...p} autoComplete="address-level2" value={addr.city} onChange={setA('city')} />}</Field>
              <Field label="State" error={errors.state}>{(p) => <input {...p} autoComplete="address-level1" value={addr.state} onChange={setA('state')} />}</Field>
            </div>
          </section>

          <section className="panel" aria-labelledby="ship-h">
            <h2 id="ship-h">Shipping</h2>
            <div className="radios" role="radiogroup" aria-labelledby="ship-h">
              <label className={`radio ${method === 'standard' ? 'on' : ''}`}>
                <input type="radio" name="ship" checked={method === 'standard'} onChange={() => setMethod('standard')} />
                <span><b>Standard</b> 3 to 6 business days</span>
                <em>{quote && method === 'standard' ? (quote.shippingCents ? money(quote.shippingCents) : 'Free') : money(config.shippingStandardCents)}</em>
              </label>
              <label className={`radio ${method === 'express' ? 'on' : ''}`}>
                <input type="radio" name="ship" checked={method === 'express'} onChange={() => setMethod('express')} />
                <span><b>Express</b> 1 to 2 business days</span>
                <em>{money(config.shippingExpressCents)}</em>
              </label>
            </div>
          </section>

          <section className="panel" aria-labelledby="pay-h">
            <h2 id="pay-h">Payment</h2>
            {mock ? (
              <>
                <Notice kind="info">Sandbox payments. Use card <b className="mono">4242 4242 4242 4242</b>, any future expiry and any 3-digit code. Card <span className="mono">4000 0000 0000 0002</span> is declined.</Notice>
                <div className="form-grid">
                  <Field label="Name on card" className="span2">{(p) => <input {...p} autoComplete="cc-name" value={card.name} onChange={(e) => { setCardError(''); setCard({ ...card, name: e.target.value }); }} />}</Field>
                  <Field label="Card number" className="span2">{(p) => <input {...p} className="mono" inputMode="numeric" autoComplete="cc-number" placeholder="1234 5678 9012 3456" value={card.number} onChange={(e) => { setCardError(''); setCard({ ...card, number: groupCard(e.target.value) }); }} />}</Field>
                  <Field label="Expiry (MM/YY)">{(p) => <input {...p} className="mono" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: fmtExpiry(e.target.value) })} />}</Field>
                  <Field label="Security code">{(p) => <input {...p} className="mono" inputMode="numeric" autoComplete="cc-csc" maxLength={4} value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, '') })} />}</Field>
                </div>
                {cardError && <Notice kind="error">{cardError}</Notice>}
              </>
            ) : <p>You will pay on Stripe's secure page. We never see your card details.</p>}
          </section>
          {formError && <Notice kind="error">{formError} <Link to="/cart">Review cart</Link></Notice>}
        </div>

        <aside className="summary" aria-label="Order summary">
          <h2>Order summary</h2>
          <ul className="mini-lines">
            {(quote?.lines || []).map((l) => <li key={l.productId}><span>{l.qty} × {l.name}</span><b>{money(l.lineTotalCents)}</b></li>)}
          </ul>
          {quote && (
            <dl className="totals">
              <div><dt>Subtotal</dt><dd>{money(quote.subtotalCents)}</dd></div>
              {quote.discountCents > 0 && <div className="good"><dt>Discount ({quote.coupon.code})</dt><dd>−{money(quote.discountCents)}</dd></div>}
              <div><dt>Shipping</dt><dd>{quote.shippingCents ? money(quote.shippingCents) : 'Free'}</dd></div>
              <div><dt>GST</dt><dd>{money(quote.taxCents)}</dd></div>
              <div className="grand"><dt>Total</dt><dd>{money(quote.totalCents)}</dd></div>
            </dl>
          )}
          <button className="btn primary wide" type="submit" disabled={busy || !quote || quote.issues.length > 0}>
            {busy ? 'Placing order…' : quote ? `Pay ${money(quote.totalCents)}` : 'Pay'}
          </button>
          {quote?.issues.map((i) => <p key={i.productId} className="error-text">{i.message}</p>)}
          <p className="muted small">By placing your order you agree to our terms of sale.</p>
        </aside>
      </form>
    </div>
  );
}
