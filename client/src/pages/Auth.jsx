import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../store.jsx';
import { useSeo } from '../seo.js';
import { Field, Notice } from '../components/ui.jsx';

export default function Auth({ mode }) {
  const register = mode === 'register';
  useSeo({ title: register ? 'Create account' : 'Sign in' });
  const { user, login, register: signUp } = useStore();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const next = sp.get('next') && sp.get('next').startsWith('/') ? sp.get('next') : '/';
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={next} replace />;

  const submit = async (e) => {
    e.preventDefault(); setError(''); setFieldErrors({}); setBusy(true);
    try {
      const u = register ? await signUp(f.name, f.email, f.password) : await login(f.email, f.password);
      nav(u.role === 'admin' && next === '/' ? '/admin' : next, { replace: true });
    } catch (err) { setError(err.message); setFieldErrors(err.details || {}); } finally { setBusy(false); }
  };

  return (
    <div className="wrap auth">
      <form className="panel" onSubmit={submit} noValidate>
        <h1>{register ? 'Create your account' : 'Sign in'}</h1>
        <p className="muted">{register ? 'Save your cart, track orders and review parts you have bought.' : 'Welcome back. Your cart is waiting.'}</p>
        {error && !Object.keys(fieldErrors).length && <Notice kind="error">{error}</Notice>}
        {register && <Field label="Full name" error={fieldErrors.name}>{(p) => <input {...p} autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>}
        <Field label="Email" error={fieldErrors.email}>{(p) => <input {...p} type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}</Field>
        <Field label="Password" error={fieldErrors.password} hint={register ? 'At least 8 characters' : undefined}>
          {(p) => <input {...p} type="password" autoComplete={register ? 'new-password' : 'current-password'} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />}
        </Field>
        <button className="btn primary wide" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button>
        <p className="muted small center">
          {register ? <>Already have an account? <Link to={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link></> : <>New here? <Link to={`/register?next=${encodeURIComponent(next)}`}>Create an account</Link></>}
        </p>
        {!register && <p className="demo-creds small">Demo customer: demo@axleandco.test / Demo@1234<br />Demo admin: admin@axleandco.test / Admin@123</p>}
      </form>
    </div>
  );
}
