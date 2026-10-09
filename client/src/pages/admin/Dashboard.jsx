import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getToken } from '../../api.js';
import { money, STATUS_LABEL } from '../../format.js';
import { useStore } from '../../store.jsx';
import { Notice, Spinner } from '../../components/ui.jsx';

function RevenueChart({ data }) {
  if (!data.length) return <p className="muted">No paid orders in the last 14 days.</p>;
  const w = 640, h = 220, pad = { l: 64, r: 8, t: 12, b: 28 };
  const max = Math.max(...data.map((d) => d.revenueCents), 1);
  const bw = (w - pad.l - pad.r) / data.length;
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Daily revenue for the last 14 days">
        {[0.25, 0.5, 0.75, 1].map((f) => {
          const y = pad.t + (h - pad.t - pad.b) * (1 - f);
          return (
            <g key={f}>
              <line x1={pad.l} x2={w - pad.r} y1={y} y2={y} className="grid-line" />
              <text x={pad.l - 8} y={y + 4} textAnchor="end" className="axis">{money(Math.round(max * f), { compact: true })}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const bh = ((h - pad.t - pad.b) * d.revenueCents) / max;
          return (
            <g key={d.day}>
              <rect x={pad.l + i * bw + 4} y={h - pad.b - bh} width={bw - 8} height={bh} className="bar"><title>{`${d.day}: ${money(d.revenueCents)} from ${d.orders} order${d.orders === 1 ? '' : 's'}`}</title></rect>
              <text x={pad.l + i * bw + bw / 2} y={h - 8} textAnchor="middle" className="axis">{d.day.slice(8)}</text>
            </g>
          );
        })}
      </svg>
      <figcaption>Revenue per day (day of month). Hover a bar for the exact amount.</figcaption>
    </figure>
  );
}

export default function Dashboard() {
  const { notify } = useStore();
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/admin/stats').then(setS).catch((e) => setError(e.message)); }, []);

  const exportCsv = async () => {
    const res = await fetch('/api/admin/reports/sales.csv', { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) return notify('Could not export sales', 'error');
    const url = URL.createObjectURL(await res.blob());
    Object.assign(document.createElement('a'), { href: url, download: 'sales.csv' }).click();
    URL.revokeObjectURL(url);
  };

  if (error) return <Notice kind="error">{error}</Notice>;
  if (!s) return <Spinner />;
  return (
    <div className="dash">
      <div className="stat-row">
        <div className="stat"><span>Revenue</span><b>{money(s.revenueCents, { compact: true })}</b></div>
        <div className="stat"><span>Orders</span><b>{s.orders}</b></div>
        <div className="stat"><span>Average order</span><b>{money(s.averageOrderCents, { compact: true })}</b></div>
        <div className="stat"><span>Gross margin</span><b>{money(s.grossMarginCents, { compact: true })}</b></div>
        <div className="stat"><span>Customers</span><b>{s.customers}</b></div>
      </div>

      <div className="dash-grid">
        <section className="panel span2">
          <div className="section-head"><h2>Sales, last 14 days</h2><button className="btn small" onClick={exportCsv}>Export all orders (CSV)</button></div>
          <RevenueChart data={s.byDay} />
        </section>
        <section className="panel">
          <h2>Orders by status</h2>
          <ul className="plain stat-list">{s.byStatus.map((b) => <li key={b.status}><span>{STATUS_LABEL[b.status]}</span><b>{b.n}</b></li>)}</ul>
        </section>
        <section className="panel">
          <h2>Best sellers</h2>
          <ol className="stat-list">{s.topProducts.map((p) => <li key={p.id}><Link to={`/parts/${p.id}`}>{p.name}</Link><b>{p.units} sold</b></li>)}</ol>
        </section>
        <section className="panel span2">
          <div className="section-head"><h2>Running low</h2><Link to="/admin/inventory">Manage stock</Link></div>
          {s.lowStock.length === 0 ? <p className="muted">Nothing is running low.</p> : (
            <table className="table"><thead><tr><th>SKU</th><th>Product</th><th className="num">Stock</th></tr></thead>
              <tbody>{s.lowStock.slice(0, 8).map((p) => <tr key={p.id}><td className="mono">{p.sku}</td><td>{p.name}</td><td className="num"><span className={`badge ${p.stock === 0 ? 'cancelled' : 'processing'}`}>{p.stock === 0 ? 'Out' : p.stock}</span></td></tr>)}</tbody></table>
          )}
        </section>
      </div>
    </div>
  );
}
