import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { money } from '../../format.js';
import { useStore } from '../../store.jsx';
import { Notice, Spinner } from '../../components/ui.jsx';

function StockEditor({ product, onSaved }) {
  const { notify } = useStore();
  const [v, setV] = useState(String(product.stock));
  const dirty = Number(v) !== product.stock;
  const save = async (e) => {
    e.preventDefault();
    try { await api(`/admin/products/${product.id}/stock`, { method: 'PATCH', body: { stock: Number(v) } }); notify(`${product.sku} stock set to ${v}`); onSaved(); }
    catch (err) { notify(err.message, 'error'); }
  };
  return (
    <form className="inline-form" onSubmit={save}>
      <input aria-label={`Stock for ${product.sku}`} inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, ''))} />
      <button className="btn small" disabled={!dirty || v === ''}>Update</button>
    </form>
  );
}

function SupplierSync({ supplier, onDone }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const run = async () => {
    setError(''); setResult(null);
    const items = text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [sku, stock, cost] = l.split(',').map((x) => x.trim());
      return { sku, stock: Number(stock), ...(cost ? { costCents: Math.round(Number(cost) * 100) } : {}) };
    });
    if (items.some((i) => !i.sku || Number.isNaN(i.stock))) { setError('Each line should look like: SKU,stock or SKU,stock,cost'); return; }
    try { const r = await api(`/admin/suppliers/${supplier.id}/sync`, { method: 'POST', body: { items } }); setResult(r); onDone(); }
    catch (e) { setError(e.message); }
  };
  return (
    <details className="supplier">
      <summary><b>{supplier.name}</b> <span className="muted small">{supplier.productCount} products · {supplier.leadTimeDays} day lead time{supplier.dropship ? ' · drop-ships to customers' : ''}</span></summary>
      <p className="small muted">Paste the supplier's stock feed, one line per part: <span className="mono">SKU,stock,cost(optional, in ₹)</span>. In production the same endpoint takes a scheduled feed or a supplier webhook.</p>
      <textarea rows="4" className="mono" aria-label={`Stock feed for ${supplier.name}`} value={text} onChange={(e) => setText(e.target.value)} placeholder={'FLT-SWF-OIL,60,185\nBAT-PRO-45,12'} />
      <button className="btn small" onClick={run} disabled={!text.trim()}>Apply feed</button>
      {error && <Notice kind="error">{error}</Notice>}
      {result && <Notice kind="success">Updated {result.updated} products.{result.unknown.length > 0 && ` Not found for this supplier: ${result.unknown.join(', ')}`}</Notice>}
    </details>
  );
}

export default function AdminInventory() {
  const [stats, setStats] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [error, setError] = useState('');
  const load = () => { api('/admin/stats').then(setStats).catch((e) => setError(e.message)); api('/admin/suppliers').then((r) => setSuppliers(r.suppliers)); };
  useEffect(load, []);
  if (error) return <Notice kind="error">{error}</Notice>;
  if (!stats) return <Spinner />;
  return (
    <div className="dash-grid">
      <section className="panel span2">
        <h2>Low and out of stock</h2>
        {stats.lowStock.length === 0 ? <p className="muted">All products are above their alert level.</p> : (
          <table className="table"><thead><tr><th>SKU</th><th>Product</th><th className="num">Alert at</th><th>Set stock</th></tr></thead>
            <tbody>{stats.lowStock.map((p) => <tr key={p.id}><td className="mono">{p.sku}</td><td>{p.name}</td><td className="num">{p.threshold}</td><td><StockEditor product={p} onSaved={load} /></td></tr>)}</tbody></table>
        )}
      </section>
      <section className="panel span2">
        <h2>Suppliers</h2>
        {suppliers.map((s) => <SupplierSync key={s.id} supplier={s} onDone={load} />)}
      </section>
    </div>
  );
}
