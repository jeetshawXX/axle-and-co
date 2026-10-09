import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { money, vehicleLabel } from '../format.js';
import { useStore } from '../store.jsx';
import FitmentPicker from './FitmentPicker.jsx';

function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Axle & Co. home">
      <svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true">
        <circle cx="20" cy="20" r="15" fill="none" stroke="#F7C600" strokeWidth="6" />
        <circle cx="20" cy="20" r="4" fill="#F7C600" />
      </svg>
      <span>Axle <i>&amp;</i> Co.</span>
    </Link>
  );
}

function SearchBox() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef();

  useEffect(() => {
    if (q.trim().length < 2) { setList([]); return; }
    const t = setTimeout(() => api('/products/suggest', { params: { q } }).then((r) => { setList(r.suggestions); setActive(-1); }).catch(() => {}), 160);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const go = (e) => {
    e.preventDefault();
    if (active >= 0 && list[active]) nav(`/parts/${encodeURIComponent(list[active].sku)}`);
    else if (q.trim()) nav(`/shop?q=${encodeURIComponent(q.trim())}`);
    setOpen(false);
  };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, list.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
    if (e.key === 'Escape') setOpen(false);
  };

  return (
    <form className="search" role="search" onSubmit={go} ref={box}>
      <input type="search" value={q} placeholder="Search parts, brands or part numbers" aria-label="Search parts"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
        role="combobox" aria-expanded={open && list.length > 0} aria-controls="suggest-list" autoComplete="off" />
      <button className="btn primary" type="submit">Search</button>
      {open && list.length > 0 && (
        <ul className="suggest" id="suggest-list" role="listbox">
          {list.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === active} className={i === active ? 'active' : ''}>
              <Link to={`/parts/${encodeURIComponent(s.sku)}`} onClick={() => { setOpen(false); setQ(''); }}>
                <img src={s.image} alt="" width="44" height="33" />
                <span><b>{s.name}</b><small className="mono">{s.partNumber}</small></span>
                <em>{money(s.priceCents)}</em>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

export default function Header() {
  const { user, count, garage, setGarage, logout, config } = useStore();
  const [picking, setPicking] = useState(false);
  const nav = useNavigate();
  const [cats, setCats] = useState([]);
  useEffect(() => { api('/categories').then((r) => setCats(r.categories)).catch(() => {}); }, []);

  return (
    <header className="site-header">
      <a href="#main" className="skip">Skip to content</a>
      {config && (
        <p className="promo">Free shipping on orders over {money(config.freeShippingOverCents)}. Use code <b>WELCOME10</b> for 10% off your first order.</p>
      )}
      <div className="bar">
        <Logo />
        <SearchBox />
        <button className={`garage-btn ${garage ? 'set' : ''}`} onClick={() => setPicking((p) => !p)} aria-expanded={picking} aria-controls="garage-panel">
          <span className="garage-label">My car</span>
          <span className="garage-value">{garage ? vehicleLabel(garage) : 'Add your car'}</span>
        </button>
        <nav className="actions" aria-label="Account">
          {user ? (
            <div className="account-menu">
              <Link to="/account/orders">{user.name.split(' ')[0]}</Link>
              {user.role === 'admin' && <Link to="/admin">Admin</Link>}
              <button className="link" onClick={() => { logout(); nav('/'); }}>Sign out</button>
            </div>
          ) : <Link to="/login" className="signin">Sign in</Link>}
          <Link to="/cart" className="cart-link" aria-label={`Cart, ${count} item${count === 1 ? '' : 's'}`}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 4h2.5l2.4 10.5h9.7L20 7H7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="9.5" cy="19" r="1.6" fill="currentColor" /><circle cx="17" cy="19" r="1.6" fill="currentColor" /></svg>
            <span className="count" aria-hidden="true">{count}</span>
          </Link>
        </nav>
      </div>
      {picking && (
        <div className="garage-panel" id="garage-panel">
          <div className="wrap">
            <FitmentPicker compact submitLabel="Save my car" onDone={() => { setPicking(false); nav('/shop?fit=1'); }} />
            {garage && <button className="link" onClick={() => { setGarage(null); setPicking(false); }}>Remove my car</button>}
          </div>
        </div>
      )}
      <nav className="cats" aria-label="Categories">
        <div className="wrap">
          <NavLink to="/shop" end className={({ isActive }) => (isActive && !window.location.search ? 'active' : '')}>All parts</NavLink>
          {cats.map((c) => <Link key={c.id} to={`/shop?category=${c.slug}`}>{c.name}</Link>)}
        </div>
      </nav>
    </header>
  );
}
