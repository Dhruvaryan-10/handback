import { PayPalError } from '../paypal/client.js';
import type { Rental } from '../store/types.js';
import { formatUSD, type Cents } from './money.js';
import { approvedTotal, type DeductionLine } from './pricing.js';
import { next } from './stateMachine.js';
import { event, holdOf, UserError, type Deps } from './rentals.js';

/**
 * The ONLY code path that moves money. It runs after a person (the shop owner) approves,
 * under a per-rental lock, re-reads the rental, recomputes the amount from approved lines,
 * caps it at the hold, and uses a deterministic PayPal-Request-Id so a retry can never charge twice.
 */
export async function settleRental(deps: Deps, rentalId: string, approvedLines: DeductionLine[]) {
  return deps.store.withRentalLock(rentalId, async () => {
    const r = await deps.store.getRental(rentalId);
    if (!r) throw new UserError('Rental not found', 404);
    if (r.status === 'settled_void' || r.status === 'settled_captured') return r; // already done: idempotent
    // "settling" means an earlier attempt died mid-call: retrying is safe because the request ids are deterministic.
    if (r.status !== 'returned' && r.status !== 'held' && r.status !== 'settling') {
      throw new UserError(`Cannot settle a rental that is "${r.status}"`, 409);
    }
    if (!r.authorizationId) throw new UserError('No PayPal hold on this rental', 409);

    // On a retry, settle exactly what was approved the first time, never a new amount under the same request id.
    const lines = r.status === 'settling' && r.settlement ? r.settlement.lines : approvedLines;
    // Damage is capped at the refundable deposit. The rental fee is owed for the lending itself,
    // but only once the item actually went out (a release before pick-up charges nothing).
    const damage = approvedTotal(lines, r.depositCents);
    if (r.status === 'held' && damage > 0) throw new UserError('Before pick-up the hold can only be released, not charged', 409);
    const fee = r.status === 'settling' && r.settlement?.feeCents !== undefined ? r.settlement.feeCents : r.status === 'held' ? 0 : (r.rentalFeeCents ?? 0);
    const total = fee + damage;
    if (r.status !== 'settling') r.status = next(r.status, 'settle_started');
    r.settlement =
      r.settlement && lines !== approvedLines ? r.settlement : { lines, totalCents: total, feeCents: fee, damageCents: damage, approvedAt: new Date().toISOString() };
    await deps.store.saveRental(r);

    try {
      if (total === 0) {
        await deps.paypal.voidAuthorization(r.authorizationId, `void-${r.id}`);
        r.status = next(r.status, 'voided');
        await event(deps, r.id, 'paypal_voided', { authorizationId: r.authorizationId });
      } else {
        const capture = await deps.paypal.captureAuthorization(
          r.authorizationId,
          total,
          `capture-${r.id}`,
          `Handback: ${[fee ? `${formatUSD(fee)} rental fee` : '', damage ? `${formatUSD(damage)} for new damage` : ''].filter(Boolean).join(' + ')}; the rest of your ${formatUSD(holdOf(r))} hold is released.`.slice(0, 255),
        );
        r.captureId = capture.id;
        r.capturedCents = total;
        if (capture.status === 'COMPLETED') {
          r.status = next(r.status, 'captured');
        } else if (capture.status === 'PENDING') {
          r.status = next(r.status, 'capture_pending');
        } else {
          throw new UserError(`PayPal capture returned ${capture.status}`, 502);
        }
        await event(deps, r.id, 'paypal_captured', { captureId: capture.id, status: capture.status, amountCents: total, feeCents: fee, damageCents: damage });
      }
    } catch (e) {
      r.status = next(r.status, 'settle_failed');
      await deps.store.saveRental(r);
      const detail = e instanceof PayPalError ? { status: e.status, issue: e.issue, debugId: e.debugId } : { message: (e as Error).message };
      await event(deps, r.id, 'paypal_settle_failed', detail);
      throw e instanceof PayPalError ? new UserError(`PayPal refused: ${e.issue ?? e.message}`, 502) : e;
    }
    await deps.store.saveRental(r);
    return r;
  });
}

/** Appeal upheld: partial refund on the capture. Never more than what was captured minus earlier refunds. */
export async function refundAppeal(deps: Deps, rentalId: string, amountCents: Cents, reason: string): Promise<Rental> {
  return deps.store.withRentalLock(rentalId, async () => {
    const r = await deps.store.getRental(rentalId);
    if (!r) throw new UserError('Rental not found', 404);
    if (r.status !== 'settled_captured' || !r.captureId || !r.capturedCents) throw new UserError('Nothing captured to refund', 409);
    const refundable = r.capturedCents - (r.refundedCents ?? 0);
    if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > refundable) {
      throw new UserError(`Refund must be between $0.01 and ${formatUSD(refundable)}`);
    }
    const n = (await deps.store.listEvents(r.id)).filter((e) => e.kind === 'paypal_refunded').length;
    const refund = await deps.paypal.refundCapture(r.captureId, amountCents, `refund-${r.id}-${n + 1}`, reason);
    r.refundedCents = (r.refundedCents ?? 0) + amountCents;
    r.status = next(r.status, 'refunded');
    await deps.store.saveRental(r);
    await event(deps, r.id, 'paypal_refunded', { refundId: refund.id, status: refund.status, amountCents, reason: reason.slice(0, 200) });
    return r;
  });
}

/** Holds last 29 days with a 3-day honor period; reauthorize long rentals from day 4. */
export function needsReauthorization(r: Rental, nowMs = Date.now()): boolean {
  if (!r.authorizedAt || !r.authorizationId) return false;
  if (r.status !== 'held' && r.status !== 'out' && r.status !== 'returned') return false;
  const ageDays = (nowMs - Date.parse(r.authorizedAt)) / 86_400_000;
  return ageDays >= 3 && ageDays < 29;
}

export async function reauthorizeIfNeeded(deps: Deps, rentalId: string) {
  return deps.store.withRentalLock(rentalId, async () => {
    const r = await deps.store.getRental(rentalId);
    if (!r || !needsReauthorization(r)) return r;
    const res = await deps.paypal.reauthorize(r.authorizationId!, holdOf(r), `reauth-${r.authorizationId}`);
    const old = r.authorizationId;
    r.authorizationId = res.id;
    r.authorizedAt = new Date().toISOString();
    await deps.store.saveRental(r);
    await event(deps, r.id, 'paypal_reauthorized', { from: old, to: res.id });
    return r;
  });
}
