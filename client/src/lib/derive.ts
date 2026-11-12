import { holdOf, type Rental, type RentalEvent } from '../api';

/** Everything here is computed from backend data only. No numbers are invented. */

export type Tone = 'neutral' | 'info' | 'warn' | 'good' | 'bad' | 'accent';

export const STATUS: Record<string, { label: string; tone: Tone; stage: number }> = {
  booked: { label: 'Awaiting deposit', tone: 'neutral', stage: 0 },
  hold_pending: { label: 'Awaiting PayPal approval', tone: 'warn', stage: 0 },
  held: { label: 'Deposit held', tone: 'info', stage: 1 },
  out: { label: 'Out with renter', tone: 'accent', stage: 2 },
  returned: { label: 'Review needed', tone: 'warn', stage: 3 },
  settling: { label: 'Settling', tone: 'warn', stage: 3 },
  attention: { label: 'Needs attention', tone: 'bad', stage: 3 },
  settled_void: { label: 'Released in full', tone: 'good', stage: 4 },
  settled_captured: { label: 'Settled', tone: 'good', stage: 4 },
  cancelled: { label: 'Cancelled', tone: 'neutral', stage: 0 },
};

export const statusInfo = (s: string) => STATUS[s] ?? { label: s, tone: 'neutral' as Tone, stage: 0 };

export const STAGES = ['Deposit', 'Pick-up', 'Rental', 'Return review', 'Settled'] as const;

export const isActive = (r: Rental) => ['held', 'out', 'returned', 'settling', 'attention'].includes(r.status);
export const isSettled = (r: Rental) => r.status === 'settled_captured' || r.status === 'settled_void';
/** Deposit currently on hold at PayPal (authorized, not yet captured or voided). */
export const isHeld = (r: Rental) => Boolean(r.authorizationId) && ['held', 'out', 'returned', 'settling'].includes(r.status);
export const needsInspection = (r: Rental) =>
  (r.status === 'held' && r.pickupPhotos.length === 0) || r.status === 'out' || r.status === 'returned';

export function inspectionStage(r: Rental): { label: string; tone: Tone } {
  if (r.status === 'booked' || r.status === 'hold_pending' || r.status === 'cancelled') return { label: 'Not started', tone: 'neutral' };
  if (r.pickupPhotos.length === 0) return { label: 'Pick-up photos due', tone: 'warn' };
  if (!r.baselineAcknowledgedAt) return { label: 'Baseline awaiting sign-off', tone: 'warn' };
  if (r.status === 'out') return { label: 'Baseline signed', tone: 'info' };
  if (r.status === 'returned') return { label: 'Return ready for review', tone: 'warn' };
  if (r.proposal) {
    const n = r.proposal.lines.length;
    return { label: n ? `${n} new finding${n > 1 ? 's' : ''}` : 'No new damage', tone: n ? 'bad' : 'good' };
  }
  return { label: 'Baseline signed', tone: 'info' };
}

export interface Stats {
  active: number;
  heldCents: number;
  heldCount: number;
  settled: number;
  capturedCents: number;
  refundedCents: number;
  /** rental fees earned (captured) */
  feesCents: number;
  /** damage captured, before refunds */
  damageCents: number;
  pendingInspections: number;
}

export function computeStats(rentals: Rental[]): Stats {
  const held = rentals.filter(isHeld);
  return {
    active: rentals.filter(isActive).length,
    heldCents: held.reduce((s, r) => s + holdOf(r), 0),
    heldCount: held.length,
    settled: rentals.filter(isSettled).length,
    capturedCents: rentals.reduce((s, r) => s + (r.status === 'settled_captured' || r.status === 'attention' ? r.capturedCents ?? 0 : 0), 0),
    refundedCents: rentals.reduce((s, r) => s + (r.refundedCents ?? 0), 0),
    feesCents: rentals.reduce((s, r) => s + (r.captureId ? r.settlement?.feeCents ?? 0 : 0), 0),
    damageCents: rentals.reduce((s, r) => s + (r.captureId ? r.settlement?.damageCents ?? (r.capturedCents ?? 0) - (r.settlement?.feeCents ?? 0) : 0), 0),
    pendingInspections: rentals.filter(needsInspection).length,
  };
}

export type PaymentKind = 'authorization' | 'capture' | 'release' | 'refund';
export interface PaymentRow {
  rentalId: string;
  kind: PaymentKind;
  amountCents: number;
  reference?: string;
  status: string;
  tone: Tone;
}

/** One row per money movement, derived from rental state. Authorization is a hold, never a charge. */
export function paymentRows(rentals: Rental[]): PaymentRow[] {
  const rows: PaymentRow[] = [];
  for (const r of rentals) {
    if (!r.authorizationId) continue;
    const held = isHeld(r);
    rows.push({
      rentalId: r.id,
      kind: 'authorization',
      amountCents: holdOf(r),
      reference: r.authorizationId,
      status: held ? 'On hold' : r.status === 'settled_void' || r.status === 'cancelled' ? 'Voided' : 'Closed',
      tone: held ? 'info' : 'neutral',
    });
    if (r.captureId) {
      rows.push({
        rentalId: r.id,
        kind: 'capture',
        amountCents: r.capturedCents ?? 0,
        reference: r.captureId,
        status: r.status === 'attention' ? 'Pending at PayPal' : 'Captured',
        tone: r.status === 'attention' ? 'warn' : 'bad',
      });
      if (r.status === 'settled_captured') {
        const released = holdOf(r) - (r.capturedCents ?? 0);
        if (released > 0) rows.push({ rentalId: r.id, kind: 'release', amountCents: released, status: 'Released', tone: 'good' });
      }
    } else if (r.status === 'settled_void' || r.status === 'cancelled') {
      rows.push({ rentalId: r.id, kind: 'release', amountCents: holdOf(r), status: 'Released in full', tone: 'good' });
    }
    if (r.refundedCents) {
      rows.push({ rentalId: r.id, kind: 'refund', amountCents: r.refundedCents, reference: r.captureId, status: 'Refunded', tone: 'good' });
    }
  }
  return rows;
}

const EVENT_LABELS: Record<string, string> = {
  rental_created: 'Rental created',
  paypal_order_created: 'PayPal order created',
  paypal_authorized: 'Deposit authorized (hold placed)',
  pickup_baseline: 'Pick-up inspection recorded',
  baseline_acknowledged: 'Renter signed off the baseline',
  return_analysed: 'Return compared with pick-up',
  paypal_captured: 'Deduction captured',
  paypal_voided: 'Hold voided, deposit released',
  rental_cancelled: 'Rental cancelled',
  paypal_refunded: 'Refund issued',
  paypal_reauthorized: 'Hold renewed',
  paypal_settle_failed: 'PayPal settlement failed',
};

export function eventLabel(kind: string): string {
  if (kind.startsWith('webhook:')) return `PayPal webhook · ${kind.slice(8)}`;
  return EVENT_LABELS[kind] ?? kind.replace(/_/g, ' ');
}

export function eventGroup(kind: string): 'payment' | 'inspection' | 'rental' {
  if (kind.startsWith('paypal') || kind.startsWith('webhook')) return 'payment';
  if (['pickup_baseline', 'baseline_acknowledged', 'return_analysed'].includes(kind)) return 'inspection';
  return 'rental';
}

export function eventDetail(e: RentalEvent): string {
  const d = e.detail as Record<string, unknown>;
  const cents = (k: string) => (typeof d[k] === 'number' ? `$${((d[k] as number) / 100).toFixed(2)}` : null);
  switch (e.kind) {
    case 'rental_created':
      return [cents('rentalFeeCents') && d.rentalFeeCents ? `Fee ${cents('rentalFeeCents')}` : '', cents('depositCents') ? `Deposit ${cents('depositCents')}` : ''].filter(Boolean).join(' + ');
    case 'pickup_baseline':
      return `${d.marks ?? 0} existing mark(s)`;
    case 'return_analysed':
      return `${d.lines ?? 0} finding(s) · proposed ${cents('totalCents') ?? '$0.00'}${d.needsReview ? ' · needs review' : ''}`;
    case 'paypal_captured':
    case 'paypal_refunded':
      return cents('amountCents') ?? '';
    case 'paypal_settle_failed':
      return String(d.issue ?? d.message ?? '');
    default:
      return '';
  }
}

export function matchesQuery(r: Rental, itemName: string, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [r.id, r.renterName, itemName, statusInfo(r.status).label].some((v) => v.toLowerCase().includes(s));
}

export const FILTERS = {
  all: (_: Rental) => true,
  active: isActive,
  attention: (r: Rental) => r.status === 'returned' || r.status === 'attention' || r.status === 'hold_pending',
  settled: isSettled,
} as const;
export type FilterKey = keyof typeof FILTERS;

export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export function durationDays(a: string, b: string) {
  return Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000));
}
