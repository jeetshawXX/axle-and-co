import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { seedDatabase } from './seed.js';

const config = loadConfig();
const db = openDb(config.dbFile);

// First run: load the demo catalogue so the store is usable immediately.
if (db.prepare('SELECT COUNT(*) AS n FROM products').get().n === 0) {
  console.log('Empty database, seeding demo catalogue...');
  await seedDatabase(db, { config });
}

const app = createApp({ db, config });

// Release stock held by abandoned, unpaid orders.
const timer = setInterval(() => {
  try { app.locals.orders.expireStale(30); } catch (e) { console.error(e); }
}, 5 * 60 * 1000);
timer.unref();

app.listen(config.port, () => {
  console.log(`${config.storeName} running on ${config.publicUrl.replace(/:\d+$/, '')}:${config.port}  (payments: ${app.locals.payments.provider})`);
});
