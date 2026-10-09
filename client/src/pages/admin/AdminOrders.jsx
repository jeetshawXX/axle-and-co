import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { dateTime, money, STATUS_LABEL } from '../../format.js';
import { useStore } from '../../store.jsx';
import { Notice, Spinner } from '../../components/ui.jsx';
import { StatusBadge } from '../Orders.jsx';

function OrderRow({ order, onChange }) {
  const { notify } = useStore();
  const [open, setOpen] = useState(false);
  const [carrier, setCarrier] = useState('Blue Dart');
  const [tracking, setTracking] = useState('');
  const [busy, setBusy] = useState(false);
  const a = order.shippingAddress;

  const move = async (status) => {
    setBusy(true);
    try {
      const r = await api(`/admin/orders/${order.number}`, { method: 'PATCH', body: { status, carrier, trackingNumber: tracking } });
      onChange(r.order); notify(`${order.number}: ${STATUS_LABEL[status].toLowerCase()}`);
    } catch (e) { notify(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <li className="admin-order">
      <button className="row-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <b className="mono">{order.number}</b>
        <span>{order.email}</span>
        <span className="muted small">{dateTime(order.createdAt)}</span>
        <StatusBadge status={order.status} />
        <b>{money(order.totalCents)}</b>
      </button>
      {open && (
        <div className="row-body">
          <ul className="mini-lines">{order.items.map((i) => <li key={i.sku}><span>{i.qty} × {i.name} <small className="mono">{i.sku}</small></span><b>{money(i.unitPriceCents * i.qty)}</b></li>)}</ul>
          <p className="small"><b>Ship to:</b> {a.fullName}, {a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city}, {a.state} {a.postalCode}. {a.phone}</p>
          <p className="small"><b>Payment:</b> {order.paymentStatus.replace('_', ' ')} ({order.paymentProvider}){order.cardLast4 && ` card ending ${order.cardLast4}`}{order.affiliateRef && ` · affiliate: ${order.affiliateRef}`}</p>
          {order.trackingNumber && <p className="small"><b>Tracking:</b> {order.carrier} <span className="mono">{order.trackingNumber}</span></p>}
          <div className="actions-row">
            {order.status === 'paid' && <button className="btn small primary" disabled={busy} onClick={() => move('processing')}>Start processing</button>}
            {order.status === 'processing' && (
              <>
                <input aria-label="Carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Carrier" />
                <input aria-label="Tracking number" value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Tracking number" />
                <button className="btn small primary" disabled={busy || !tracking.trim() || !carrier.trim()} onClick={() => move('shipped')}>Mark shipped</button>
              </>
            )}
            {order.status === 'shipped' && <button className="btn small primary" disabled={busy} onClick={() => move('delivered')}>Mark delivered</button>}
            {['pending_payment', 'paid', 'processing'].includes(order.status) && <button className="btn small danger" disabled={busy} onClick={() => window.confirm('Cancel this order and refund the customer?') && move('cancelled')}>Cancel order</button>}
          </div>
        </div>
      )}
    </li>
  );
}

export default function AdminOrders() {
  const [status, setStatus] = useState('');
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { setOrders(null); api('/admin/orders', { params: { status } }).then((r) => setOrders(r.orders)).catch((e) => setError(e.message)); }, [status]);
  const replace = (o) => setOrders((list) => list.map((x) => (x.number === o.number ? o : x)));
  return (
    <div>
      <div className="section-head">
        <h2>Orders</h2>
        <label className="sort">Show <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All orders</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select></label>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {!orders && !error && <Spinner />}
      {orders?.length === 0 && <p className="muted">No orders with this status.</p>}
      <ul className="admin-orders">{orders?.map((o) => <OrderRow key={o.number} order={o} onChange={replace} />)}</ul>
    </div>
  );
}
