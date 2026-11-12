import { env, features } from './config.js';
import { createApp } from './app.js';
import { inspector } from './ai/gemini.js';
import { paypal } from './paypal/client.js';
import { MemoryStore } from './store/memory.js';
import { PostgresStore } from './store/postgres.js';
import { seed } from './seed.js';
import { createDemoWorkspace } from './demo/workspace.js';
import { reauthorizeIfNeeded } from './domain/settlement.js';

const store = env.DATABASE_URL ? new PostgresStore(env.DATABASE_URL) : new MemoryStore();
await seed(store);

const deps = { store, paypal, inspector };
const app = createApp(deps, { demoWorkspace: await createDemoWorkspace() });

app.listen(env.PORT, () => {
  console.log(`Handback API on http://localhost:${env.PORT}`);
  console.log(`  PayPal sandbox: ${features.paypal ? 'configured' : 'NOT configured (set PAYPAL_CLIENT_ID/SECRET)'}`);
  console.log(`  Gemini vision:  ${features.ai ? 'configured' : 'NOT configured (set GEMINI_API_KEY)'}`);
  console.log(`  Database:       ${features.db ? 'Postgres' : 'in-memory (resets on restart)'}`);
});

// Keep long rentals' holds valid: reauthorize after the 3-day honor period. Hourly is plenty.
if (features.paypal) {
  setInterval(async () => {
    for (const r of await store.listRentals()) {
      await reauthorizeIfNeeded(deps, r.id).catch((e) => console.error('reauthorize failed', r.id, (e as Error).message));
    }
  }, 60 * 60 * 1000).unref();
}
