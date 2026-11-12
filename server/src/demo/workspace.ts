/**
 * Demo workspace: simulated PayPal + simulated AI, pre-filled with one rental at every stage.
 * Used two ways: mounted at /demo-api inside the normal server (the "Try demo" switch in the app),
 * and standalone with `npm run demo`. Its store is separate, so demo data never mixes with real rentals.
 * The PayPal and Gemini responses here are scripted stand-ins (the test-suite fakes), never real results;
 * IDs look like ORDER3 / AUTH4 / CAP7 so they cannot be confused with real sandbox IDs.
 */
import { readFileSync } from 'node:fs';
import { MemoryStore } from '../store/memory.js';
import { seed } from '../seed.js';
import * as R from '../domain/rentals.js';
import { refundAppeal, settleRental } from '../domain/settlement.js';
import type { Finding } from '../ai/schema.js';
import type { DemoHooks } from '../routes/api.js';
import { FakeInspector, FakePayPal } from '../../test/fakes.js';

export async function createDemoWorkspace(): Promise<R.Deps & { demo: DemoHooks }> {
  const photo = (name: string) => readFileSync(new URL(`../../../demo/${name}`, import.meta.url)).toString('base64');
  const before = photo('before.jpg');
  const after = photo('after.jpg');

  const f = (label: string, type: Finding['type'], severity: Finding['severity'], box_2d: number[], confidence: number): Finding => ({ label, type, severity, box_2d, confidence });

  // Scripted findings on the "front" angle (every demo item has one). Matches demo/before.jpg and demo/after.jpg.
  const paypal = new FakePayPal();
  const inspector = new FakeInspector(
    { front: [f('Scuff near top-left corner', 'scratch', 'minor', [190, 295, 240, 355], 0.88)] },
    {
      front: [
        f('Crack near bottom-right corner', 'crack', 'moderate', [615, 580, 770, 680], 0.92),
        f('Small chip on lower edge', 'other', 'minor', [728, 530, 768, 562], 0.52),
      ],
    },
  );

  const store = new MemoryStore();
  await seed(store);
  const deps = { store, paypal: paypal.asClient, inspector: inspector.asInspector };

  const DAY = 86_400_000;
  const photos = (data: string, angles: string[]) => angles.map((angle) => ({ angle, mimeType: 'image/jpeg' as const, data }));

  type Stage = 'booked' | 'pending' | 'held' | 'baseline' | 'out' | 'returned' | 'clean' | 'captured' | 'refund' | 'cancelled';

  async function make(renterName: string, stage: Stage, itemId: string, startDaysAgo: number, days: number) {
    const startsAt = new Date(Date.now() - startDaysAgo * DAY);
    const endsAt = new Date(startsAt.getTime() + days * DAY);
    const r = await R.createRental(deps, { itemId, renterName, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
    if (stage === 'cancelled') {
      const { orderId } = await R.createHoldOrder(deps, r.id);
      paypal.approve(orderId);
      await R.authorizeHold(deps, r.id);
      await R.cancelRental(deps, r.id);
      return;
    }
    if (stage === 'booked') return;
    const { orderId } = await R.createHoldOrder(deps, r.id);
    if (stage === 'pending') return;
    paypal.approve(orderId);
    await R.authorizeHold(deps, r.id);
    if (stage === 'held') return;
    const angles = (await store.getItem(itemId))!.angles;
    await R.recordPickup(deps, r.id, photos(before, angles));
    if (stage === 'baseline') return;
    await R.acknowledgeBaseline(deps, r.id);
    if (stage === 'out') return;
    if (stage === 'clean') {
      // Clean return: same photos back, so nothing new.
      const clean = new FakeInspector(inspector.baselineMarks, {});
      await R.recordReturn({ ...deps, inspector: clean.asInspector }, r.id, photos(before, angles));
      await settleRental(deps, r.id, []);
      return;
    }
    const ret = (await R.recordReturn(deps, r.id, photos(after, angles))) as { proposal: { lines: { needsReview: boolean }[] } };
    if (stage === 'returned') return;
    await settleRental(deps, r.id, ret.proposal.lines.filter((l) => !l.needsReview) as never);
    if (stage === 'refund') await refundAppeal(deps, r.id, 1000, 'Renter showed part of the crack was a sticker edge; $10 refunded');
  }

  // One rental at every stage, oldest first.
  await make('Maya Rao', 'refund', 'cam-a7iv', 9, 2); //          fee + damage captured, then part-refunded on appeal
  await make('Arjun Mehta', 'clean', 'drone-mini', 7, 3); //      returned clean: only the rental fee charged
  await make('Daniel Kim', 'captured', 'laptop-16', 5, 2); //     fee + new damage captured, rest released
  await make('Grace Liu', 'cancelled', 'tent-4p', 6, 2); //       cancelled before pick-up: hold voided
  await make('Lena Ortiz', 'returned', 'lens-70200', 3, 2); //    AI comparison waiting for the owner
  await make('Sam Patel', 'out', 'ebike-city', 2, 4); //          out with the renter
  await make('Chloe Martin', 'out', 'projector-4k', 4, 2); //     out and overdue
  await make('Priya Nair', 'baseline', 'kayak-2p', 0, 3); //      baseline shot, renter yet to sign
  await make('Omar Haddad', 'held', 'escooter', 0, 2); //         fee + deposit held, ready for pick-up photos
  await make('Tom Becker', 'pending', 'pa-speaker', 0, 1); //     PayPal approval pending
  await make('Ana Silva', 'booked', 'cine-kit', -1, 2); //        just booked

  return {
    ...deps,
    demo: {
      // Stands in for the renter clicking "Approve" on PayPal.
      async approveHold(rentalId: string) {
        const { orderId } = await R.createHoldOrder(deps, rentalId);
        paypal.approve(orderId);
        return R.authorizeHold(deps, rentalId);
      },
    },
  };
}
