import { describe, expect, it } from 'vitest';
import type { Rental } from '../../client/src/api';
import { computeStats, eventLabel, FILTERS, inspectionStage, matchesQuery, paymentRows, statusInfo } from '../../client/src/lib/derive';

const base: Rental = {
  id: 'r_1',
  itemId: 'cam',
  renterName: 'Maya',
  status: 'booked',
  depositCents: 30000,
  startsAt: '2026-11-14T10:00:00Z',
  endsAt: '2026-11-16T10:00:00Z',
  pickupPhotos: [],
  returnPhotos: [],
  baseline: {},
};
const r = (o: Partial<Rental>): Rental => ({ ...base, ...o });

const rentals: Rental[] = [
  r({ id: 'a', status: 'booked' }),
  r({ id: 'b', status: 'held', authorizationId: 'AUTH_B' }),
  r({ id: 'c', status: 'out', authorizationId: 'AUTH_C', pickupPhotos: [{ angle: 'front' }], baselineAcknowledgedAt: 'x', depositCents: 40000 }),
  r({ id: 'd', status: 'settled_captured', authorizationId: 'AUTH_D', captureId: 'CAP_D', capturedCents: 4500, refundedCents: 1000 }),
  r({ id: 'e', status: 'settled_void', authorizationId: 'AUTH_E', depositCents: 25000 }),
];

describe('dashboard numbers come only from rental state', () => {
  it('counts holds, settlements and money correctly', () => {
    const s = computeStats(rentals);
    expect(s.active).toBe(2);
    expect(s.heldCents).toBe(70000); // b + c only; settled holds are no longer held
    expect(s.heldCount).toBe(2);
    expect(s.settled).toBe(2);
    expect(s.capturedCents).toBe(4500);
    expect(s.refundedCents).toBe(1000);
    expect(s.pendingInspections).toBe(2); // b needs pick-up photos, c needs return
  });

  it('shows zeros, not made-up values, when there is no data', () => {
    expect(computeStats([])).toEqual({ active: 0, heldCents: 0, heldCount: 0, settled: 0, capturedCents: 0, refundedCents: 0, feesCents: 0, damageCents: 0, pendingInspections: 0 });
    expect(paymentRows([])).toEqual([]);
  });
});

describe('payment rows keep hold and charge apart', () => {
  const rows = paymentRows(rentals);
  it('lists an authorization as a hold, never as a charge', () => {
    const b = rows.filter((x) => x.rentalId === 'b');
    expect(b).toEqual([{ rentalId: 'b', kind: 'authorization', amountCents: 30000, reference: 'AUTH_B', status: 'On hold', tone: 'info' }]);
  });
  it('splits a settlement into capture, release and refund', () => {
    const d = rows.filter((x) => x.rentalId === 'd').map((x) => [x.kind, x.amountCents, x.status]);
    expect(d).toEqual([
      ['authorization', 30000, 'Closed'],
      ['capture', 4500, 'Captured'],
      ['release', 25500, 'Released'],
      ['refund', 1000, 'Refunded'],
    ]);
  });
  it('shows a voided hold as a full release with no capture', () => {
    const e = rows.filter((x) => x.rentalId === 'e').map((x) => [x.kind, x.amountCents]);
    expect(e).toEqual([
      ['authorization', 25000],
      ['release', 25000],
    ]);
  });
  it('skips rentals that never got a PayPal hold', () => {
    expect(rows.some((x) => x.rentalId === 'a')).toBe(false);
  });
});

describe('labels, filters and search', () => {
  it('labels every status and falls back safely', () => {
    expect(statusInfo('returned').label).toBe('Review needed');
    expect(statusInfo('mystery').label).toBe('mystery');
    expect(eventLabel('paypal_captured')).toBe('Deduction captured');
    expect(eventLabel('webhook:PAYMENT.CAPTURE.COMPLETED')).toBe('PayPal webhook · PAYMENT.CAPTURE.COMPLETED');
  });
  it('describes the inspection stage', () => {
    expect(inspectionStage(rentals[1]!).label).toBe('Pick-up photos due');
    const done = r({ status: 'settled_captured', pickupPhotos: [{ angle: 'f' }], baselineAcknowledgedAt: 'x', proposal: { lines: [], totalCents: 0, capped: false, needsReview: false, matchedPreexisting: {} } });
    expect(inspectionStage(done)).toEqual({ label: 'No new damage', tone: 'good' });
  });
  it('filters and searches by renter, item, id and status', () => {
    expect(rentals.filter(FILTERS.settled).map((x) => x.id)).toEqual(['d', 'e']);
    expect(rentals.filter(FILTERS.active).map((x) => x.id)).toEqual(['b', 'c']);
    expect(matchesQuery(rentals[0]!, 'Camera', 'maya')).toBe(true);
    expect(matchesQuery(rentals[0]!, 'Camera', 'camera')).toBe(true);
    expect(matchesQuery(rentals[0]!, 'Camera', 'awaiting')).toBe(true);
    expect(matchesQuery(rentals[0]!, 'Camera', 'drone')).toBe(false);
    expect(matchesQuery(rentals[0]!, 'Camera', '   ')).toBe(true);
  });
});
