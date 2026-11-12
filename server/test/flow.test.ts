import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/store/memory.js';
import { seed } from '../src/seed.js';
import {
  acknowledgeBaseline,
  authorizeHold,
  createHoldOrder,
  createRental,
  recordPickup,
  recordReturn,
  cancelRental,
  deleteRental,
  type Deps,
} from '../src/domain/rentals.js';
import { refundAppeal, settleRental } from '../src/domain/settlement.js';
import { FakeInspector, FakePayPal, mark, photo } from './fakes.js';

const ANGLES = ['front', 'back', 'top', 'lens'];

async function rentalOut(deps: Deps, pp: FakePayPal) {
  const r = await createRental(deps, { itemId: 'cam-a7iv', renterName: 'Maya', startsAt: '2026-11-14T10:00:00Z', endsAt: '2026-11-16T10:00:00Z' });
  const { orderId } = await createHoldOrder(deps, r.id);
  pp.approve(orderId);
  await authorizeHold(deps, r.id);
  const pickup = await recordPickup(deps, r.id, ANGLES.map(photo));
  expect(pickup.ok).toBe(true);
  await acknowledgeBaseline(deps, r.id);
  return r.id;
}

describe('rental flow with fake PayPal and fake AI', () => {
  let pp: FakePayPal;
  let deps: Deps;
  let inspector: FakeInspector;

  beforeEach(async () => {
    pp = new FakePayPal();
    inspector = new FakeInspector(
      { back: [mark('scuff on grip'), mark('scratch near hot shoe')] },
      { lens: [mark('crack on lens hood', 'crack', 'moderate')] },
    );
    const store = new MemoryStore();
    await seed(store);
    deps = { store, paypal: pp.asClient, inspector: inspector.asInspector };
  });

  // Camera: $300 deposit + $45/day. Two days = $90 rental fee, so the PayPal hold is $390.
  it('holds fee + deposit, ignores pre-existing marks, captures fee + $45 damage and releases the rest', async () => {
    const id = await rentalOut(deps, pp);
    const order = pp.calls.find((c) => c.op === 'createOrder')!.args[0] as { depositCents: number };
    expect(order.depositCents).toBe(39000);
    const ret = await recordReturn(deps, id, ANGLES.map(photo));
    expect(ret.ok).toBe(true);
    if (!ret.ok) return;
    expect(ret.proposal.totalCents).toBe(4500);
    expect(ret.proposal.matchedPreexisting.back).toEqual(['scuff on grip', 'scratch near hot shoe']);
    const settled = await settleRental(deps, id, ret.proposal.lines);
    expect(settled.status).toBe('settled_captured');
    expect(settled.capturedCents).toBe(13500);
    expect(settled.settlement).toMatchObject({ feeCents: 9000, damageCents: 4500 });
    expect(pp.calls.find((c) => c.op === 'capture')!.args[1]).toBe(13500);
    expect(pp.count('capture')).toBe(1);
  });

  it('a double tap on approve captures once', async () => {
    const id = await rentalOut(deps, pp);
    const ret = await recordReturn(deps, id, ANGLES.map(photo));
    if (!ret.ok) throw new Error('expected proposal');
    const [a, b] = await Promise.all([settleRental(deps, id, ret.proposal.lines), settleRental(deps, id, ret.proposal.lines)]);
    expect(a.status).toBe('settled_captured');
    expect(b.status).toBe('settled_captured');
    expect(pp.count('capture')).toBe(1);
    expect(pp.captures.size).toBe(1);
  });

  it('a clean return charges only the rental fee; the whole deposit is released', async () => {
    inspector.newFindings = {};
    const id = await rentalOut(deps, pp);
    const ret = await recordReturn(deps, id, ANGLES.map(photo));
    if (!ret.ok) throw new Error('expected proposal');
    const settled = await settleRental(deps, id, ret.proposal.lines);
    expect(settled.status).toBe('settled_captured');
    expect(settled.capturedCents).toBe(9000);
    expect(settled.settlement).toMatchObject({ feeCents: 9000, damageCents: 0 });
    expect(pp.count('void')).toBe(0);
  });

  it('releasing before pick-up charges nothing (void), even though a fee was quoted', async () => {
    const r = await createRental(deps, { itemId: 'cam-a7iv', renterName: 'Maya', startsAt: '2026-11-14T10:00:00Z', endsAt: '2026-11-15T10:00:00Z' });
    const { orderId } = await createHoldOrder(deps, r.id);
    pp.approve(orderId);
    await authorizeHold(deps, r.id);
    const settled = await settleRental(deps, r.id, []);
    expect(settled.status).toBe('settled_void');
    expect(pp.count('capture')).toBe(0);
    expect(pp.count('void')).toBe(1);
  });

  it('cancel voids a live hold; delete refuses rentals that are out, and removes the rest', async () => {
    const r = await createRental(deps, { itemId: 'drill-kit', renterName: 'Sam', startsAt: '2026-11-14T10:00:00Z', endsAt: '2026-11-15T10:00:00Z' });
    expect(r.rentalFeeCents).toBe(1200);
    const { orderId } = await createHoldOrder(deps, r.id);
    pp.approve(orderId);
    await authorizeHold(deps, r.id);
    const c = await cancelRental(deps, r.id);
    expect(c.status).toBe('cancelled');
    expect(pp.count('void')).toBe(1);
    await deleteRental(deps, r.id);
    expect(await deps.store.getRental(r.id)).toBeUndefined();
    expect(await deps.store.listEvents(r.id)).toEqual([]);

    const out = await rentalOut(deps, pp);
    await expect(deleteRental(deps, out)).rejects.toThrow(/still out/);
    await expect(cancelRental(deps, out)).rejects.toThrow();
    expect(pp.count('void')).toBe(1);
  });

  it('after a failed capture, a retry uses the same request id and charges once', async () => {
    const id = await rentalOut(deps, pp);
    const ret = await recordReturn(deps, id, ANGLES.map(photo));
    if (!ret.ok) throw new Error('expected proposal');
    pp.failNextCapture = true;
    await expect(settleRental(deps, id, ret.proposal.lines)).rejects.toThrow();
    const r2 = await settleRental(deps, id, ret.proposal.lines);
    expect(r2.status).toBe('settled_captured');
    const ids = pp.calls.filter((c) => c.op === 'capture').map((c) => c.args[2]);
    expect(new Set(ids).size).toBe(1);
    expect(pp.captures.size).toBe(1);
  });

  it('refuses pick-up photos before the hold, and asks for retakes on bad photos', async () => {
    const r = await createRental(deps, { itemId: 'cam-a7iv', renterName: 'Maya', startsAt: '2026-11-14T10:00:00Z', endsAt: '2026-11-15T10:00:00Z' });
    await expect(recordPickup(deps, r.id, ANGLES.map(photo))).rejects.toThrow(/hold/);
    const { orderId } = await createHoldOrder(deps, r.id);
    await expect(authorizeHold(deps, r.id)).rejects.toThrow(/not approved/);
    pp.approve(orderId);
    await authorizeHold(deps, r.id);
    inspector.unusable = ['top'];
    const res = await recordPickup(deps, r.id, ANGLES.map(photo));
    expect(res.ok).toBe(false);
  });

  it('appeal refunds are bounded by what was captured', async () => {
    const id = await rentalOut(deps, pp);
    const ret = await recordReturn(deps, id, ANGLES.map(photo));
    if (!ret.ok) throw new Error('expected proposal');
    await settleRental(deps, id, ret.proposal.lines);
    // captured $135 (fee $90 + damage $45)
    await refundAppeal(deps, id, 2000, 'scratch was on the pick-up photo');
    await expect(refundAppeal(deps, id, 12000, 'too much')).rejects.toThrow(/between/);
    const r = await refundAppeal(deps, id, 11500, 'rest');
    expect(r.refundedCents).toBe(13500);
  });

  it('owner edits cannot push damage past the deposit (fee + deposit = the hold)', async () => {
    const id = await rentalOut(deps, pp);
    const ret = await recordReturn(deps, id, ANGLES.map(photo));
    if (!ret.ok) throw new Error('expected proposal');
    const inflated = ret.proposal.lines.map((l) => ({ ...l, amountCents: 999_999 }));
    const settled = await settleRental(deps, id, inflated);
    expect(settled.capturedCents).toBe(39000);
    expect(settled.settlement).toMatchObject({ feeCents: 9000, damageCents: 30000 });
  });
});
