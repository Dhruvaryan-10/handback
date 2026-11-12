import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { env, features } from '../config.js';
import { AIUnavailableError, type Photo } from '../ai/gemini.js';
import { PayPalError, PayPalNotConfiguredError } from '../paypal/client.js';
import { TransitionError } from '../domain/stateMachine.js';
import {
  cancelRental,
  deleteRental,
  holdOf,
  acknowledgeBaseline,
  authorizeHold,
  createHoldOrder,
  createRental,
  event,
  loadRentalView,
  recordPickup,
  recordReturn,
  UserError,
  type Deps,
} from '../domain/rentals.js';
import { refundAppeal, settleRental } from '../domain/settlement.js';
import { DAMAGE_TYPES, SEVERITIES } from '../ai/schema.js';

const PhotoIn = z.object({
  angle: z.string().min(1).max(40),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  data: z.string().min(100),
});
const PhotosIn = z.object({ photos: z.array(PhotoIn).min(1).max(8) });

const LineIn = z.object({
  angle: z.string(),
  label: z.string().max(120),
  type: z.enum(DAMAGE_TYPES),
  severity: z.enum(SEVERITIES),
  amountCents: z.number().int().min(0),
  confidence: z.number().min(0).max(1),
  needsReview: z.boolean(),
  box_2d: z.array(z.number()).length(4),
});

/** Strip photo payloads from API responses; photos are fetched one at a time. */
function publicRental<T extends { pickupPhotos: Photo[]; returnPhotos: Photo[] }>(r: T) {
  return {
    ...r,
    holdCents: holdOf(r as unknown as { depositCents: number; rentalFeeCents?: number }),
    pickupPhotos: r.pickupPhotos.map((p) => ({ angle: p.angle })),
    returnPhotos: r.returnPhotos.map((p) => ({ angle: p.angle })),
  };
}

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, nextFn: NextFunction) =>
    fn(req, res).catch(nextFn);

function requireShop(req: Request) {
  if (req.header('x-shop-token') !== env.SHOP_ADMIN_TOKEN) throw new UserError('Shop approval required', 401);
}

/** Present only in `npm run demo`: simulated PayPal approval so the hold step works without a sandbox login. */
export interface DemoHooks {
  approveHold(rentalId: string): Promise<unknown>;
}

export function apiRouter(deps: Deps & { demo?: DemoHooks }) {
  const r = express.Router();
  const demo = deps.demo;

  r.get('/config', (_req, res) => {
    res.json({
      paypalClientId: env.PAYPAL_CLIENT_ID || null,
      features: demo ? { ...features, paypal: true, ai: true } : features,
      environment: 'sandbox',
      demo: Boolean(demo),
    });
  });

  r.get('/health', (_req, res) => res.json({ ok: true, features }));

  r.get(
    '/events',
    wrap(async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
      res.json(await deps.store.listRecentEvents(limit));
    }),
  );

  r.get('/items', wrap(async (_req, res) => res.json(await deps.store.listItems())));

  r.get(
    '/rentals',
    wrap(async (_req, res) => {
      const rentals = await deps.store.listRentals();
      res.json(rentals.map(publicRental));
    }),
  );

  r.post(
    '/rentals',
    wrap(async (req, res) => {
      const body = z.object({ itemId: z.string(), renterName: z.string().max(80), startsAt: z.string(), endsAt: z.string() }).parse(req.body);
      res.status(201).json(publicRental(await createRental(deps, body)));
    }),
  );

  r.get(
    '/rentals/:id',
    wrap(async (req, res) => {
      const view = await loadRentalView(deps, req.params.id!);
      res.json({ ...view, rental: publicRental(view.rental) });
    }),
  );

  r.get(
    '/rentals/:id/photos/:phase/:angle',
    wrap(async (req, res) => {
      const rental = await deps.store.getRental(req.params.id!);
      const list = req.params.phase === 'pickup' ? rental?.pickupPhotos : rental?.returnPhotos;
      const photo = list?.find((p) => p.angle === req.params.angle);
      if (!photo) throw new UserError('Photo not found', 404);
      res.type(photo.mimeType).set('Cache-Control', 'private, max-age=3600').send(Buffer.from(photo.data, 'base64'));
    }),
  );

  // --- PayPal hold ---
  r.post('/rentals/:id/paypal/order', wrap(async (req, res) => res.json(await createHoldOrder(deps, req.params.id!))));
  if (demo) r.post('/demo/rentals/:id/approve', wrap(async (req, res) => res.json(await demo.approveHold(req.params.id!))));
  r.post('/rentals/:id/paypal/authorize', wrap(async (req, res) => res.json(publicRental(await authorizeHold(deps, req.params.id!)))));

  // --- Inspections ---
  r.post(
    '/rentals/:id/pickup',
    wrap(async (req, res) => {
      const { photos } = PhotosIn.parse(req.body);
      res.json(await recordPickup(deps, req.params.id!, photos));
    }),
  );
  r.post('/rentals/:id/acknowledge', wrap(async (req, res) => res.json(publicRental(await acknowledgeBaseline(deps, req.params.id!)))));
  r.post(
    '/rentals/:id/return',
    wrap(async (req, res) => {
      const { photos } = PhotosIn.parse(req.body);
      res.json(await recordReturn(deps, req.params.id!, photos));
    }),
  );

  // --- Money (owner approval required) ---
  r.post(
    '/rentals/:id/settle',
    wrap(async (req, res) => {
      requireShop(req);
      const { lines } = z.object({ lines: z.array(LineIn).max(50) }).parse(req.body);
      res.json(publicRental(await settleRental(deps, req.params.id!, lines)));
    }),
  );
  r.post(
    '/rentals/:id/refund',
    wrap(async (req, res) => {
      requireShop(req);
      const { amountCents, reason } = z.object({ amountCents: z.number().int().positive(), reason: z.string().max(200) }).parse(req.body);
      res.json(publicRental(await refundAppeal(deps, req.params.id!, amountCents, reason)));
    }),
  );

  // --- Cancel / delete (shop only). A live hold is voided on PayPal first; nothing is ever stranded. ---
  r.post(
    '/rentals/:id/cancel',
    wrap(async (req, res) => {
      requireShop(req);
      res.json(publicRental(await cancelRental(deps, req.params.id!)));
    }),
  );
  r.delete(
    '/rentals/:id',
    wrap(async (req, res) => {
      requireShop(req);
      res.json(await deleteRental(deps, req.params.id!));
    }),
  );

  // --- Webhooks: verify with PayPal first, de-duplicate by event id, then record ---
  r.post(
    '/paypal/webhook',
    wrap(async (req, res) => {
      const evt = req.body as { id?: string; event_type?: string; resource?: Record<string, unknown> };
      const verified = await deps.paypal.verifyWebhook(req.headers, req.body).catch(() => false);
      if (!verified || !evt.id) {
        res.status(401).json({ ok: false });
        return;
      }
      if (!(await deps.store.markWebhookSeen(evt.id))) {
        res.json({ ok: true, duplicate: true });
        return;
      }
      const resource = evt.resource ?? {};
      const related = (resource.supplementary_data as { related_ids?: { order_id?: string } } | undefined)?.related_ids;
      const orderId = related?.order_id ?? (resource.id as string | undefined);
      const rental = orderId ? await deps.store.findRentalByOrder(orderId) : undefined;
      if (rental) await event(deps, rental.id, `webhook:${evt.event_type}`, { eventId: evt.id, status: resource.status });
      res.json({ ok: true });
    }),
  );

  // --- Errors: never leak internals; always say what happened ---
  r.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid request', issues: err.issues.slice(0, 5) });
    if (err instanceof UserError) return res.status(err.status).json({ error: err.message });
    if (err instanceof TransitionError) return res.status(409).json({ error: err.message });
    if (err instanceof AIUnavailableError) {
      console.error('AI unavailable:', err.attempts.map((a) => `${a.model} ${a.kind}`).join(', '));
      const rateLimited = err.attempts.some((a) => a.kind === 'rate_limited');
      return res.status(503).json({ error: rateLimited ? 'The photo check is busy (rate limit). Wait a minute and try again.' : 'The photo check is unavailable right now. Try again, or review manually.' });
    }
    if (err instanceof PayPalNotConfiguredError) return res.status(503).json({ error: 'PayPal sandbox keys are not set on the server (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET).' });
    if (err instanceof PayPalError) return res.status(502).json({ error: `PayPal: ${err.issue ?? err.message}`, debugId: err.debugId });
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong' });
  });

  return r;
}
