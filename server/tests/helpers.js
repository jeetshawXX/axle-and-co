import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { seedDatabase, DEMO_ADMIN, DEMO_CUSTOMER } from '../src/seed.js';

export const GOOD_CARD = { name: 'Test Buyer', number: '4242 4242 4242 4242', expiry: '12/34', cvc: '123' };
export const ADDRESS = { fullName: 'Test Buyer', phone: '9876543210', line1: '12 MG Road', line2: '', city: 'Nagpur', state: 'Maharashtra', postalCode: '440001' };

export async function startApp() {
  const config = { ...loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'test-secret', STRIPE_SECRET_KEY: '' }), clientDist: '/nonexistent' };
  const db = openDb(':memory:');
  await seedDatabase(db, { bcryptRounds: 4 });
  const app = createApp({ db, config, mailMode: 'memory', bcryptRounds: 4 });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(method, path, { token, body } = {}) {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, body: json, text };
  }
  const login = async (creds) => (await call('POST', '/api/auth/login', { body: creds })).body.token;
  return {
    app, db, config, call, base,
    get: (p, o) => call('GET', p, o), post: (p, body, token) => call('POST', p, { body, token }),
    put: (p, body, token) => call('PUT', p, { body, token }), patch: (p, body, token) => call('PATCH', p, { body, token }),
    adminToken: () => login(DEMO_ADMIN), customerToken: () => login(DEMO_CUSTOMER),
    close: () => new Promise((r) => server.close(r))
  };
}
