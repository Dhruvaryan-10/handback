import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiRouter, type DemoHooks } from './routes/api.js';
import type { Deps } from './domain/rentals.js';

export function createApp(deps: Deps & { demo?: DemoHooks }, opts: { demoWorkspace?: Deps & { demo: DemoHooks } } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '25mb' })); // up to 4 compressed photos per request
  app.use('/api', apiRouter(deps));
  // Separate sample-data workspace with simulated PayPal + AI (the in-app "Try demo" switch).
  if (opts.demoWorkspace) app.use('/demo-api', apiRouter(opts.demoWorkspace));

  // Serve the built client in production (single Render service).
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
  app.use(express.static(dist));
  app.get(/^\/(?!api\/|demo-api\/).*/, (_req, res, next) => res.sendFile(path.join(dist, 'index.html'), (err) => err && next()));
  return app;
}
