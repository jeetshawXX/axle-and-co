import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api.js';
import { money } from '../../format.js';
import { useStore } from '../../store.jsx';
import { Field, Notice, Spinner } from '../../components/ui.jsx';

const emptyProduct = {
  sku: '', partNumber: '', name: '', brand: '', categoryId: '', supplierId: '', description: '', image: '', price: '', salePrice: '', cost: '',
  stock: '0', lowStockThreshold: '5', weightKg: '1', isUniversal: false, isActive: true, specs: [{ k: '', v: '' }], fitment: []
};

const toForm = (p) => ({
  ...emptyProduct, ...p, supplierId: p.supplierId || '', categoryId: String(p.categoryId),
  price: String(p.priceCents / 100), salePrice: p.salePriceCents != null ? String(p.salePriceCents / 100) : '', cost: String(p.costCents / 100),
  stock: String(p.stock), lowStockThreshold: String(p.lowStockThreshold), weightKg: String(p.weightKg),
  specs: Object.entries(p.specs).map(([k, v]) => ({ k, v })).concat([{ k: '', v: '' }])
});

function ProductForm({ initial, meta, onCancel, onSaved }) {
  const { vehicles, notify } = useStore();
  const [f, setF] = useState(initial);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const editing = !!f.id;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setError(''); setErrors({}); setBusy(true);
    const body = {
      sku: f.sku, partNumber: f.partNumber, name: f.name, brand: f.brand, categoryId: Number(f.categoryId), supplierId: f.supplierId ? Number(f.supplierId) : null,
      description: f.description, image: f.image || `/img/${meta.categories.find((c) => String(c.id) === String(f.categoryId))?.slug || 'tools'}.svg`,
      priceCents: Math.round(Number(f.price) * 100), salePriceCents: f.salePrice !== '' ? Math.round(Number(f.salePrice) * 100) : null,
      costCents: Math.round(Number(f.cost || 0) * 100), stock: Number(f.stock), lowStockThreshold: Number(f.lowStockThreshold), weightKg: Number(f.weightKg),
      isUniversal: f.isUniversal, isActive: f.isActive,
      specs: Object.fromEntries(f.specs.filter((s) => s.k.trim() && s.v.trim()).map((s) => [s.k.trim(), s.v.trim()])),
      fitment: f.isUniversal ? [] : f.fitment.filter((x) => x.make && x.model).map((x) => ({ make: x.make, model: x.model, yearFrom: Number(x.yearFrom), yearTo: Number(x.yearTo) }))
    };
    if (Number.isNaN(body.priceCents)) { setErrors({ priceCents: 'Enter a price' }); setBusy(false); return; }
    try {
      await api(editing ? `/admin/products/${f.id}` : '/admin/products', { method: editing ? 'PUT' : 'POST', body });
      notify(editing ? 'Product saved' : 'Product added'); onSaved();
    } catch (err) { setError(err.message); setErrors(err instanceof ApiError ? err.details : {}); } finally { setBusy(false); }
  };

  const updateFit = (i, patch) => setF({ ...f, fitment: f.fitment.map((x, j) => (j === i ? { ...x, ...patch } : x)) });

  return (
    <form className="panel product-form" onSubmit={submit} noValidate>
      <h2>{editing ? `Edit ${f.sku}` : 'Add a product'}</h2>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="form-grid cols3">
        <Field label="SKU" error={errors.sku}>{(p) => <input {...p} className="mono" value={f.sku} onChange={set('sku')} />}</Field>
        <Field label="Part number" error={errors.partNumber}>{(p) => <input {...p} className="mono" value={f.partNumber} onChange={set('partNumber')} />}</Field>
        <Field label="Brand" error={errors.brand}>{(p) => <input {...p} value={f.brand} onChange={set('brand')} />}</Field>
        <Field label="Name" error={errors.name} className="span3">{(p) => <input {...p} value={f.name} onChange={set('name')} />}</Field>
        <Field label="Category" error={errors.categoryId}>{(p) => <select {...p} value={f.categoryId} onChange={set('categoryId')}><option value="">Choose</option>{meta.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</Field>
        <Field label="Supplier">{(p) => <select {...p} value={f.supplierId} onChange={set('supplierId')}><option value="">None</option>{meta.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}</Field>
        <Field label="Weight (kg)">{(p) => <input {...p} inputMode="decimal" value={f.weightKg} onChange={set('weightKg')} />}</Field>
        <Field label="Price (₹)" error={errors.priceCents}>{(p) => <input {...p} inputMode="decimal" value={f.price} onChange={set('price')} />}</Field>
        <Field label="Sale price (₹, optional)" error={errors.salePriceCents}>{(p) => <input {...p} inputMode="decimal" value={f.salePrice} onChange={set('salePrice')} />}</Field>
        <Field label="Your cost (₹)">{(p) => <input {...p} inputMode="decimal" value={f.cost} onChange={set('cost')} />}</Field>
        <Field label="Stock" error={errors.stock}>{(p) => <input {...p} inputMode="numeric" value={f.stock} onChange={set('stock')} />}</Field>
        <Field label="Low-stock alert at">{(p) => <input {...p} inputMode="numeric" value={f.lowStockThreshold} onChange={set('lowStockThreshold')} />}</Field>
        <Field label="Image path (optional)">{(p) => <input {...p} placeholder="/img/brakes.svg" value={f.image} onChange={set('image')} />}</Field>
        <Field label="Description" className="span3">{(p) => <textarea {...p} rows="3" value={f.description} onChange={set('description')} />}</Field>
      </div>

      <fieldset className="subform">
        <legend>Specifications</legend>
        {f.specs.map((s, i) => (
          <div className="kv" key={i}>
            <input aria-label="Specification name" placeholder="Name (e.g. Material)" value={s.k} onChange={(e) => setF({ ...f, specs: f.specs.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)) })} />
            <input aria-label="Specification value" placeholder="Value" value={s.v} onChange={(e) => setF({ ...f, specs: f.specs.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)) })} />
          </div>
        ))}
        <button type="button" className="link" onClick={() => setF({ ...f, specs: [...f.specs, { k: '', v: '' }] })}>Add another specification</button>
      </fieldset>

      <fieldset className="subform">
        <legend>Fitment</legend>
        <label className="check"><input type="checkbox" checked={f.isUniversal} onChange={set('isUniversal')} /> Universal part (fits every vehicle)</label>
        {!f.isUniversal && (
          <>
            {f.fitment.map((x, i) => {
              const models = vehicles.find((m) => m.make === x.make)?.models || [];
              return (
                <div className="fit-row" key={i}>
                  <select aria-label="Make" value={x.make} onChange={(e) => updateFit(i, { make: e.target.value, model: '' })}><option value="">Make</option>{vehicles.map((m) => <option key={m.make}>{m.make}</option>)}</select>
                  <select aria-label="Model" value={x.model} onChange={(e) => { const r = models.find((m) => m.model === e.target.value); updateFit(i, { model: e.target.value, yearFrom: r?.yearFrom ?? x.yearFrom, yearTo: r?.yearTo ?? x.yearTo }); }}><option value="">Model</option>{models.map((m) => <option key={m.model}>{m.model}</option>)}</select>
                  <input aria-label="From year" inputMode="numeric" value={x.yearFrom} onChange={(e) => updateFit(i, { yearFrom: e.target.value })} />
                  <input aria-label="To year" inputMode="numeric" value={x.yearTo} onChange={(e) => updateFit(i, { yearTo: e.target.value })} />
                  <button type="button" className="link" onClick={() => setF({ ...f, fitment: f.fitment.filter((_, j) => j !== i) })}>Remove</button>
                </div>
              );
            })}
            <button type="button" className="link" onClick={() => setF({ ...f, fitment: [...f.fitment, { make: '', model: '', yearFrom: 2015, yearTo: 2024 }] })}>Add a vehicle</button>
          </>
        )}
      </fieldset>

      <label className="check"><input type="checkbox" checked={f.isActive} onChange={set('isActive')} /> Visible in the store</label>
      <div className="actions-row">
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save product'}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export default function AdminProducts() {
  const { notify } = useStore();
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  const [meta, setMeta] = useState({ categories: [], suppliers: [] });
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  const load = () => api('/admin/products', { params: { q } }).then((r) => setList(r.products)).catch((e) => setError(e.message));
  useEffect(() => { api('/admin/meta').then(setMeta); }, []);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const hide = async (p) => {
    if (!window.confirm(`Hide “${p.name}” from the store? Past orders keep their history.`)) return;
    try { await api(`/admin/products/${p.id}`, { method: 'DELETE' }); notify('Product hidden'); load(); } catch (e) { notify(e.message, 'error'); }
  };

  if (editing) return <ProductForm initial={editing} meta={meta} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />;
  return (
    <div>
      <div className="section-head">
        <h2>Products</h2>
        <button className="btn primary" onClick={() => setEditing(emptyProduct)}>Add product</button>
      </div>
      <input className="admin-search" type="search" placeholder="Search by name, SKU or part number" aria-label="Search products" value={q} onChange={(e) => setQ(e.target.value)} />
      {error && <Notice kind="error">{error}</Notice>}
      {!list && !error && <Spinner />}
      {list && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>SKU</th><th>Product</th><th>Category</th><th className="num">Price</th><th className="num">Stock</th><th>Status</th><th><span className="sr">Actions</span></th></tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className={p.isActive ? '' : 'dim'}>
                  <td className="mono">{p.sku}</td><td>{p.name}</td><td>{p.categoryName}</td>
                  <td className="num">{money(p.salePriceCents ?? p.priceCents)}</td>
                  <td className="num"><span className={`badge ${p.stock === 0 ? 'cancelled' : p.stock <= p.lowStockThreshold ? 'processing' : 'delivered'}`}>{p.stock}</span></td>
                  <td>{p.isActive ? 'Live' : 'Hidden'}</td>
                  <td className="nowrap"><button className="link" onClick={() => setEditing(toForm(p))}>Edit</button>{p.isActive && <> · <button className="link" onClick={() => hide(p)}>Hide</button></>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && <p className="muted">No products match that search.</p>}
          {list.length === 200 && <p className="muted small">Showing the first 200. Narrow the search to find others.</p>}
        </div>
      )}
    </div>
  );
}
