import { randomUUID } from 'node:crypto';
import { env } from '../config.js';
import type { Photo, VisionInspector } from '../ai/gemini.js';
import type { Finding } from '../ai/schema.js';
import { ImageValidationError, validateBase64Image } from '../ai/image.js';
import { approveLink, firstAuthorization, type PayPalClient } from '../paypal/client.js';
import type { Rental, Store } from '../store/types.js';
import { computeDeduction } from './pricing.js';
import { billableDays } from './money.js';
import type { Cents } from './money.js';
import { next } from './stateMachine.js';

export class UserError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export interface Deps {
  store: Store;
  paypal: PayPalClient;
  inspector: VisionInspector;
}

const now = () => new Date().toISOString();

/** Amount authorized on PayPal: the rental fee plus the refundable deposit. */
export const holdOf = (r: Pick<Rental, 'depositCents' | 'rentalFeeCents'>): Cents => r.depositCents + (r.rentalFeeCents ?? 0);

export async function event(deps: Deps, rentalId: string, kind: string, detail: Record<string, unknown> = {}) {
  await deps.store.logEvent({ rentalId, at: now(), kind, detail });
}

async function load(deps: Deps, id: string): Promise<Rental> {
  const r = await deps.store.getRental(id);
  if (!r) throw new UserError('Rental not found', 404);
  return r;
}

export async function createRental(deps: Deps, input: { itemId: string; renterName: string; startsAt: string; endsAt: string }) {
  const item = await deps.store.getItem(input.itemId);
  if (!item) throw new UserError('Unknown item');
  if (!(Date.parse(input.endsAt) > Date.parse(input.startsAt))) throw new UserError('End must be after start');
  const rental: Rental = {
    id: `r_${randomUUID().slice(0, 8)}`,
    itemId: item.id,
    renterName: input.renterName.trim().slice(0, 80) || 'Renter',
    status: 'booked',
    depositCents: item.depositCents,
    rentalFeeCents: billableDays(input.startsAt, input.endsAt) * (item.dailyRateCents ?? 0),
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    pickupPhotos: [],
    baseline: {},
    returnPhotos: [],
    createdAt: now(),
    updatedAt: now(),
  };
  await deps.store.saveRental(rental);
  await event(deps, rental.id, 'rental_created', { depositCents: rental.depositCents, rentalFeeCents: rental.rentalFeeCents });
  return rental;
}

/** Creates (or re-uses) the PayPal AUTHORIZE order. The renter approves it in PayPal. */
export async function createHoldOrder(deps: Deps, rentalId: string) {
  return deps.store.withRentalLock(rentalId, async () => {
    const r = await load(deps, rentalId);
    if (r.paypalOrderId && r.status === 'hold_pending') {
      return { orderId: r.paypalOrderId, approveUrl: approveLink(await deps.paypal.getOrder(r.paypalOrderId)) };
    }
    const item = (await deps.store.getItem(r.itemId))!;
    const order = await deps.paypal.createAuthorizeOrder({
      rentalId: r.id,
      itemName: item.name,
      depositCents: holdOf(r),
      returnUrl: `${env.APP_URL}/r/${r.id}?paypal=return`,
      cancelUrl: `${env.APP_URL}/r/${r.id}?paypal=cancel`,
    });
    r.paypalOrderId = order.id;
    r.status = next(r.status, 'order_created');
    await deps.store.saveRental(r);
    await event(deps, r.id, 'paypal_order_created', { orderId: order.id, status: order.status });
    return { orderId: order.id, approveUrl: approveLink(order) };
  });
}

/** Called after the renter approves (JS SDK onApprove, return URL, or "check approval"). */
export async function authorizeHold(deps: Deps, rentalId: string) {
  return deps.store.withRentalLock(rentalId, async () => {
    const r = await load(deps, rentalId);
    if (r.status === 'held' || r.authorizationId) return r;
    if (!r.paypalOrderId) throw new UserError('No PayPal order for this rental yet');
    const current = await deps.paypal.getOrder(r.paypalOrderId);
    if (current.status !== 'APPROVED') {
      throw new UserError(`PayPal says the hold is not approved yet (order status ${current.status})`, 409);
    }
    const order = await deps.paypal.authorizeOrder(r.paypalOrderId);
    const auth = firstAuthorization(order);
    if (!auth || auth.status !== 'CREATED') {
      throw new UserError(`PayPal did not create the hold (status ${auth?.status ?? 'missing'})`, 502);
    }
    r.authorizationId = auth.id;
    r.authorizedAt = now();
    r.status = next(r.status, 'authorized');
    await deps.store.saveRental(r);
    await event(deps, r.id, 'paypal_authorized', { authorizationId: auth.id, expires: auth.expiration_time });
    return r;
  });
}

function requirePhotos(angles: string[], photos: Photo[]) {
  const missing = angles.filter((a) => !photos.some((p) => p.angle === a));
  if (missing.length) throw new UserError(`Missing photos for: ${missing.join(', ')}`);
  for (const p of photos) {
    try {
      validateBase64Image(p.data, `Photo "${p.angle}"`, p.mimeType);
    } catch (e) {
      if (e instanceof ImageValidationError) throw new UserError(e.message);
      throw e;
    }
  }
}

/** Pick-up: AI lists existing marks per angle. Renter must acknowledge before the item goes out. */
export async function recordPickup(deps: Deps, rentalId: string, photos: Photo[]) {
  const r = await load(deps, rentalId);
  if (r.status !== 'held') throw new UserError('Take pick-up photos after the PayPal hold is in place', 409);
  const item = (await deps.store.getItem(r.itemId))!;
  requirePhotos(item.angles, photos);
  const results = await Promise.all(photos.map((p) => deps.inspector.baseline(p, item.name)));
  const unusable = results.map((res, i) => (!res.quality.usable ? `${photos[i]!.angle}: ${res.quality.reason}` : null)).filter(Boolean);
  if (unusable.length) return { ok: false as const, retake: unusable };
  r.pickupPhotos = photos;
  r.baseline = Object.fromEntries(photos.map((p, i) => [p.angle, results[i]!.marks]));
  await deps.store.saveRental(r);
  await event(deps, r.id, 'pickup_baseline', { marks: Object.values(r.baseline).flat().length });
  return { ok: true as const, baseline: r.baseline };
}

export async function acknowledgeBaseline(deps: Deps, rentalId: string) {
  const r = await load(deps, rentalId);
  if (!r.pickupPhotos.length) throw new UserError('No pick-up photos yet', 409);
  r.baselineAcknowledgedAt = now();
  r.status = next(r.status, 'pickup_acknowledged');
  await deps.store.saveRental(r);
  await event(deps, r.id, 'baseline_acknowledged');
  return r;
}

/** Return: diff each angle against the signed baseline, then price new damage from the shop's list. */
export async function recordReturn(deps: Deps, rentalId: string, photos: Photo[]) {
  const r = await load(deps, rentalId);
  if (r.status !== 'out' && r.status !== 'returned') throw new UserError('This rental is not out', 409);
  const item = (await deps.store.getItem(r.itemId))!;
  requirePhotos(item.angles, photos);
  const results = await Promise.all(
    photos.map((after) => {
      const before = r.pickupPhotos.find((p) => p.angle === after.angle)!;
      return deps.inspector.diff(before, after, r.baseline[after.angle] ?? [], item.name);
    }),
  );
  const problems = results
    .map((res, i) => {
      const a = photos[i]!.angle;
      if (!res.quality.usable) return `${a}: ${res.quality.reason}`;
      if (!res.same_item) return `${a}: this looks like a different item`;
      return null;
    })
    .filter(Boolean);
  if (problems.length) return { ok: false as const, retake: problems };

  const findings: Record<string, Finding[]> = Object.fromEntries(photos.map((p, i) => [p.angle, results[i]!.new_findings]));
  const deduction = computeDeduction(findings, item.priceList, r.depositCents, env.AI_CONFIDENCE_THRESHOLD);
  r.returnPhotos = photos;
  r.proposal = {
    ...deduction,
    matchedPreexisting: Object.fromEntries(photos.map((p, i) => [p.angle, results[i]!.matched_preexisting])),
  };
  r.status = next(r.status, 'return_analysed');
  await deps.store.saveRental(r);
  await event(deps, r.id, 'return_analysed', { lines: deduction.lines.length, totalCents: deduction.totalCents, needsReview: deduction.needsReview });
  return { ok: true as const, proposal: r.proposal };
}

export async function loadRentalView(deps: Deps, id: string) {
  const r = await load(deps, id);
  const item = await deps.store.getItem(r.itemId);
  const events = await deps.store.listEvents(id);
  return { rental: r, item, events };
}

/**
 * Cancel before the item leaves the shop. If a hold exists it is voided on PayPal first
 * (nothing was charged, nothing is kept). Not possible once the item is out.
 */
export async function cancelRental(deps: Deps, rentalId: string) {
  return deps.store.withRentalLock(rentalId, async () => {
    const r = await load(deps, rentalId);
    if (r.status === 'cancelled') return r;
    if (r.status === 'held') {
      if (r.pickupPhotos.length && r.baselineAcknowledgedAt) throw new UserError('This item is already out', 409);
      await deps.paypal.voidAuthorization(r.authorizationId!, `void-${r.id}`);
      await event(deps, r.id, 'paypal_voided', { authorizationId: r.authorizationId, reason: 'cancelled before pick-up' });
    } else if (r.status !== 'booked' && r.status !== 'hold_pending') {
      throw new UserError(`A rental that is "${r.status}" can't be cancelled; settle it instead`, 409);
    }
    r.status = next(r.status, 'cancel');
    await deps.store.saveRental(r);
    await event(deps, r.id, 'rental_cancelled');
    return r;
  });
}

/**
 * Delete a rental record. Never leaves money stranded: a live hold is voided first, and rentals that are
 * out, returned or mid-settlement can't be deleted. Deleting a settled rental removes it from Handback only;
 * PayPal keeps its own transaction history.
 */
export async function deleteRental(deps: Deps, rentalId: string) {
  const r = await load(deps, rentalId);
  if (r.status === 'held') await cancelRental(deps, rentalId);
  else if (!['booked', 'hold_pending', 'cancelled', 'settled_void', 'settled_captured'].includes(r.status)) {
    throw new UserError(
      r.status === 'out' ? 'The item is still out with the renter. Check it in and settle first.' : `A rental that is "${r.status}" can't be deleted yet; settle it first`,
      409,
    );
  }
  await deps.store.withRentalLock(rentalId, () => deps.store.deleteRental(rentalId));
  return { deleted: rentalId };
}
