/**
 * Rental lifecycle. The UI never claims a money state PayPal hasn't confirmed:
 * "settling" is entered before the PayPal call, "settled_*" only after PayPal returns COMPLETED/VOIDED.
 */
export type RentalStatus =
  | 'booked' // rental created, no PayPal order yet
  | 'hold_pending' // PayPal order created, waiting for renter approval
  | 'held' // authorization created: $0 charged
  | 'out' // pickup baseline acknowledged by renter
  | 'returned' // return photos analysed, proposal ready
  | 'settling' // PayPal capture/void in flight
  | 'settled_void' // no new damage: hold voided
  | 'settled_captured' // deduction captured, rest released (final_capture)
  | 'attention' // PayPal returned PENDING or an ambiguous result: needs reconcile
  | 'cancelled';

export type RentalEvent =
  | 'order_created'
  | 'authorized'
  | 'pickup_acknowledged'
  | 'return_analysed'
  | 'settle_started'
  | 'voided'
  | 'captured'
  | 'capture_pending'
  | 'settle_failed'
  | 'refunded'
  | 'cancel';

const transitions: Record<RentalStatus, Partial<Record<RentalEvent, RentalStatus>>> = {
  booked: { order_created: 'hold_pending', cancel: 'cancelled' },
  hold_pending: { order_created: 'hold_pending', authorized: 'held', cancel: 'cancelled' },
  held: { pickup_acknowledged: 'out', settle_started: 'settling', cancel: 'cancelled' },
  out: { return_analysed: 'returned' },
  returned: { return_analysed: 'returned', settle_started: 'settling' },
  settling: {
    voided: 'settled_void',
    captured: 'settled_captured',
    capture_pending: 'attention',
    settle_failed: 'returned',
  },
  attention: { captured: 'settled_captured', settle_failed: 'returned' },
  settled_captured: { refunded: 'settled_captured' },
  settled_void: {},
  cancelled: {},
};

export class TransitionError extends Error {
  constructor(public from: RentalStatus, public event: RentalEvent) {
    super(`Cannot apply "${event}" to a rental that is "${from}"`);
  }
}

export function next(from: RentalStatus, event: RentalEvent): RentalStatus {
  const to = transitions[from][event];
  if (!to) throw new TransitionError(from, event);
  return to;
}

export function canApply(from: RentalStatus, event: RentalEvent): boolean {
  return Boolean(transitions[from][event]);
}
