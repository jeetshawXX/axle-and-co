import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { dateOnly, dateTime, money, STATUS_LABEL } from '../format.js';
import { useStore } from '../store.jsx';
import { useSeo } from '../seo.js';
import { Empty, Notice, Spinner } from '../components/ui.jsx';

export const StatusBadge = ({ status }) => <span className={`badge ${status}`}>{STATUS_LABEL[status] || status}</span>;

export function OrderList() {
  useSeo({ title: 'Your orders' });
  const { user, ready } = useStore();
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { if (user) api('/orders').then((r) => setOrders(r.orders)).catch((e) => setError(e.message)); }, [user]);
  if (ready && !user) return <div className="wrap section"><Empty title="Sign in to see your orders"><Link className="btn primary" to="/login?next=/account/orders">Sign in</Link></Empty></div>;
  return (
    <div className="wrap narrow">
      <h1>Your orders</h1>
      {error && <Notice kind="error">{error}</Notice>}
      {!orders && !error && <Spinner />}
      {orders?.length === 0 && <Empty title="No orders yet"><p>When you buy something, it will show up here with tracking.</p><Link className="btn primary" to="/shop">Browse parts</Link></Empty>}
      <ul className="order-list">
        {orders?.map((o) => (
          <li key={o.number}>
            <Link to={`/order/${o.number}`}>
              <div><b className="mono">{o.number}</b><span className="muted small"> · {dateOnly(o.createdAt)}</span></div>
              <p>{o.items.join(', ')}{o.itemCount > o.items.length ? ' …' : ''}</p>
              <div className="order-meta"><StatusBadge status={o.status} /><b>{money(o.totalCents)}</b></div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

const STEPS = [['paid', 'Paid'], ['processing', 'Preparing'], ['shipped', 'Shipped'], ['delivered', 'Delivered']];

export function OrderDetail() {
  const { number } = useParams();
  const [sp] = useSearchParams();
  const { user, ready, clearLocalCart, notify } = useStore();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useSeo({ title: `Order ${number}` });

  const load = async () => {
    try {
      const sessionId = sp.get('session_id');
      if (sessionId) {
        try { const r = await api(`/orders/${number}/confirm-payment`, { method: 'POST', body: { sessionId } }); setOrder(r.order); clearLocalCart(); return; }
        catch (e) { if (e.status !== 409) throw e; }
      }
      setOrder((await api(`/orders/${number}`)).order);
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { if (user) load(); }, [number, user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (ready && !user) return <div className="wrap section"><Empty title="Sign in to see this order"><Link className="btn primary" to={`/login?next=/order/${number}`}>Sign in</Link></Empty></div>;
  if (error) return <div className="wrap section"><Empty title="We could not open this order"><p>{error}</p><Link className="btn" to="/account/orders">Your orders</Link></Empty></div>;
  if (!order) return <div className="wrap section"><Spinner /></div>;

  const cancel = async () => {
    if (!window.confirm('Cancel this order? Any payment will be refunded.')) return;
    setBusy(true);
    try { setOrder((await api(`/orders/${number}/cancel`, { method: 'POST' })).order); notify('Order cancelled'); }
    catch (e) { notify(e.message, 'error'); } finally { setBusy(false); }
  };

  const reached = new Set(order.events.map((e) => e.status));
  const a = order.shippingAddress;
  const cancellable = ['paid', 'processing', 'pending_payment'].includes(order.status);

  return (
    <div className="wrap narrow order-page">
      {sp.get('placed') && order.paymentStatus === 'paid' && (
        <Notice kind="success"><b>Thank you, your order is confirmed.</b> A receipt has been emailed to {order.email}.</Notice>
      )}
      {order.status === 'pending_payment' && <Notice kind="info">We are still waiting for the payment to be confirmed.</Notice>}
      <div className="order-head">
        <div><h1>Order <span className="mono">{order.number}</span></h1><p className="muted">Placed {dateTime(order.createdAt)}</p></div>
        <StatusBadge status={order.status} />
      </div>

      {order.status === 'cancelled' ? (
        <Notice kind="info">This order was cancelled. {order.paymentStatus === 'refunded' ? 'Your payment has been refunded.' : order.paymentStatus === 'refund_pending' ? 'Your refund is being processed.' : 'You were not charged.'}</Notice>
      ) : (
        <ol className="timeline" aria-label="Order progress">
          {STEPS.map(([key, label]) => {
            const ev = [...order.events].reverse().find((e) => e.status === key);
            return (
              <li key={key} className={reached.has(key) ? 'done' : ''}>
                <b>{label}</b>
                <span>{ev ? dateTime(ev.at) : 'Not yet'}</span>
              </li>
            );
          })}
        </ol>
      )}

      {order.trackingNumber && (
        <p className="tracking">Tracking: <b>{order.carrier}</b> <span className="mono">{order.trackingNumber}</span></p>
      )}

      <section className="panel">
        <h2>Items</h2>
        <ul className="mini-lines">
          {order.items.map((i) => (
            <li key={i.sku}>
              <span><Link to={`/parts/${encodeURIComponent(i.sku)}`}>{i.name}</Link> × {i.qty}</span>
              <b>{money(i.unitPriceCents * i.qty)}</b>
            </li>
          ))}
        </ul>
        <dl className="totals">
          <div><dt>Subtotal</dt><dd>{money(order.subtotalCents)}</dd></div>
          {order.discountCents > 0 && <div className="good"><dt>Discount ({order.couponCode})</dt><dd>−{money(order.discountCents)}</dd></div>}
          <div><dt>Shipping ({order.shippingMethod})</dt><dd>{order.shippingCents ? money(order.shippingCents) : 'Free'}</dd></div>
          <div><dt>GST</dt><dd>{money(order.taxCents)}</dd></div>
          <div className="grand"><dt>Total</dt><dd>{money(order.totalCents)}</dd></div>
        </dl>
      </section>

      <div className="two-col">
        <section className="panel">
          <h2>Delivery address</h2>
          <address>{a.fullName}<br />{a.line1}{a.line2 && <><br />{a.line2}</>}<br />{a.city}, {a.state} {a.postalCode}<br />{a.phone}</address>
        </section>
        <section className="panel">
          <h2>Payment</h2>
          <p>{order.paymentStatus === 'paid' ? 'Paid' : order.paymentStatus.replace('_', ' ')}{order.cardLast4 && ` with card ending ${order.cardLast4}`}</p>
          {order.status === 'delivered' && <p className="muted small">Bought this? Open a part above to leave a review.</p>}
        </section>
      </div>

      {cancellable && <button className="btn danger" onClick={cancel} disabled={busy}>Cancel order</button>}
    </div>
  );
}
