import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import { setFormat } from './format.js';

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } };

export function StoreProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState(() => read('axle.cart', []));   // [{ productId, qty }]
  const [lines, setLines] = useState([]);                            // priced lines for display
  const [garage, setGarageState] = useState(() => read('axle.garage', null));
  const [vehicles, setVehicles] = useState([]);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef();

  const notify = useCallback((message, kind = 'ok') => {
    clearTimeout(toastTimer.current);
    setToast({ message, kind, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // Remember an affiliate code (?ref=partner) so the order can be credited to them.
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref && /^[A-Za-z0-9_-]{1,40}$/.test(ref)) write('axle.ref', ref);
  }, []);

  useEffect(() => {
    (async () => {
      const [c, v] = await Promise.all([api('/config'), api('/vehicles')]);
      setFormat(c); setConfig(c); setVehicles(v.makes);
      if (getToken()) {
        try {
          const me = await api('/auth/me');
          setUser(me.user);
          const cart = await api('/cart');
          setItems(cart.items);
        } catch { setToken(null); }
      }
      setReady(true);
    })().catch(() => setReady(true));
  }, []);

  // Guests keep the cart in the browser; signed-in carts live on the server.
  useEffect(() => { if (!user) write('axle.cart', items); }, [items, user]);

  // Price the basket for display. The server stays the source of truth for totals.
  useEffect(() => {
    if (!items.length) { setLines([]); return; }
    let cancelled = false;
    api('/pricing/quote', { method: 'POST', body: { items } })
      .then((r) => { if (!cancelled) setLines(r.quote.lines); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [items]);

  const setQty = useCallback(async (productId, qty) => {
    const next = qty <= 0 ? items.filter((i) => i.productId !== productId)
      : items.some((i) => i.productId === productId) ? items.map((i) => (i.productId === productId ? { ...i, qty } : i)) : [...items, { productId, qty }];
    setItems(next);
    if (user) {
      try { setItems((await api('/cart/items', { method: 'PUT', body: { productId, qty: Math.max(0, qty) } })).items); }
      catch (e) { notify(e.message, 'error'); }
    }
  }, [items, user, notify]);

  const addToCart = useCallback(async (product, qty = 1) => {
    const have = items.find((i) => i.productId === product.id)?.qty || 0;
    if (have + qty > product.stock) { notify(`Only ${product.stock} in stock`, 'error'); return; }
    await setQty(product.id, Math.min(99, have + qty));
    notify(`Added ${product.name}`);
  }, [items, setQty, notify]);

  const clearLocalCart = useCallback(() => { setItems([]); write('axle.cart', []); }, []);

  const afterAuth = useCallback(async (res) => {
    setToken(res.token);
    setUser(res.user);
    const guest = read('axle.cart', []);
    const cart = guest.length ? await api('/cart/merge', { method: 'POST', body: { items: guest } }) : await api('/cart');
    write('axle.cart', []);
    setItems(cart.items);
    return res.user;
  }, []);

  const login = (email, password) => api('/auth/login', { method: 'POST', body: { email, password } }).then(afterAuth);
  const register = (name, email, password) => api('/auth/register', { method: 'POST', body: { name, email, password } }).then(afterAuth);
  const logout = () => { setToken(null); setUser(null); setItems([]); write('axle.cart', []); };

  const setGarage = useCallback((v) => { setGarageState(v); write('axle.garage', v); }, []);

  const count = items.reduce((s, i) => s + i.qty, 0);
  const value = useMemo(() => ({
    config, user, ready, items, lines, count, garage, vehicles, toast,
    setQty, addToCart, clearLocalCart, login, register, logout, setGarage, notify, setUser
  }), [config, user, ready, items, lines, count, garage, vehicles, toast, setQty, addToCart, clearLocalCart, setGarage, notify]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
