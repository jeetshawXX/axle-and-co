import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { money } from '../../format.js';
import { useStore } from '../../store.jsx';
import { Field, Notice, Spinner } from '../../components/ui.jsx';

export default function AdminPromotions() {
  const { notify } = useStore();
  const [coupons, setCoupons] = useState(null);
  const [f, setF] = useState({ code: '', percentOff: '10', min: '0' });
  const [error, setError] = useState('');
  const load = () => api('/admin/coupons').then((r) => setCoupons(r.coupons));
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault(); setError('');
    try {
      await api('/admin/coupons', { method: 'POST', body: { code: f.code, percentOff: Number(f.percentOff), minSubtotalCents: Math.round(Number(f.min || 0) * 100) } });
      notify(`Code ${f.code.toUpperCase()} created`); setF({ code: '', percentOff: '10', min: '0' }); load();
    } catch (err) { setError(err.message); }
  };
  const toggle = async (c) => { await api(`/admin/coupons/${c.code}`, { method: 'PATCH', body: { isActive: !c.isActive } }); load(); };

  return (
    <div className="dash-grid">
      <section className="panel">
        <h2>New discount code</h2>
        <form onSubmit={add} noValidate>
          {error && <Notice kind="error">{error}</Notice>}
          <Field label="Code">{(p) => <input {...p} className="mono" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />}</Field>
          <Field label="Percent off">{(p) => <input {...p} inputMode="numeric" value={f.percentOff} onChange={(e) => setF({ ...f, percentOff: e.target.value.replace(/\D/g, '') })} />}</Field>
          <Field label="Minimum spend (₹)">{(p) => <input {...p} inputMode="numeric" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value.replace(/\D/g, '') })} />}</Field>
          <button className="btn primary">Create code</button>
        </form>
      </section>
      <section className="panel">
        <h2>Codes</h2>
        {!coupons ? <Spinner /> : (
          <table className="table"><thead><tr><th>Code</th><th className="num">Off</th><th className="num">Min spend</th><th>Status</th></tr></thead>
            <tbody>{coupons.map((c) => (
              <tr key={c.code}><td className="mono">{c.code}</td><td className="num">{c.percentOff}%</td><td className="num">{c.minSubtotalCents ? money(c.minSubtotalCents) : 'None'}</td>
                <td><button className="link" onClick={() => toggle(c)}>{c.isActive ? 'Active. Turn off' : 'Off. Turn on'}</button></td></tr>
            ))}</tbody></table>
        )}
        <p className="muted small">Affiliate links: add <span className="mono">?ref=partnername</span> to any store URL. The code is saved in the visitor's browser and recorded on their order, and shows in the admin order detail and the sales CSV.</p>
      </section>
    </div>
  );
}
