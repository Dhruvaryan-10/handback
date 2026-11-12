import { describe, expect, it } from 'vitest';
import { fromPayPalValue, toPayPalValue } from '../src/domain/money.js';
import { approvedTotal, computeDeduction } from '../src/domain/pricing.js';
import { canApply, next, TransitionError } from '../src/domain/stateMachine.js';
import { needsReauthorization } from '../src/domain/settlement.js';
import { seedItems } from '../src/seed.js';
import { DiffResult } from '../src/ai/schema.js';
import { mark } from './fakes.js';

const prices = seedItems[0]!.priceList;

describe('money', () => {
  it('converts cents to PayPal strings and back without float drift', () => {
    expect(toPayPalValue(4500)).toBe('45.00');
    expect(toPayPalValue(1)).toBe('0.01');
    expect(fromPayPalValue('255.10')).toBe(25510);
    expect(fromPayPalValue('7')).toBe(700);
    expect(() => toPayPalValue(1.5)).toThrow();
    expect(() => fromPayPalValue('1e3')).toThrow();
  });
});

describe('pricing', () => {
  it('prices findings from the shop list, never from the AI', () => {
    const d = computeDeduction({ lens: [mark('crack on hood', 'crack', 'moderate')] }, prices, 30000, 0.6);
    expect(d.totalCents).toBe(4500);
    expect(d.lines[0]!.amountCents).toBe(4500);
    expect(d.capped).toBe(false);
  });

  it('caps the total at the hold', () => {
    const d = computeDeduction(
      { front: [mark('a', 'missing_part', 'severe'), mark('b', 'crack', 'severe'), mark('c', 'dent', 'severe')] },
      prices,
      30000,
      0.6,
    );
    expect(d.uncappedCents).toBe(36000);
    expect(d.totalCents).toBe(30000);
    expect(d.capped).toBe(true);
  });

  it('sends low-confidence findings to review instead of charging them', () => {
    const d = computeDeduction({ top: [mark('maybe a scratch', 'scratch', 'minor', 0.4)] }, prices, 30000, 0.6);
    expect(d.needsReview).toBe(true);
    expect(d.totalCents).toBe(0);
  });

  it('re-applies the cap and rejects bad amounts on approval', () => {
    expect(approvedTotal([{ amountCents: 20000 }, { amountCents: 20000 }], 30000)).toBe(30000);
    expect(() => approvedTotal([{ amountCents: -1 }], 30000)).toThrow();
  });
});

describe('state machine', () => {
  it('follows the happy path', () => {
    let s = next('booked', 'order_created');
    s = next(s, 'authorized');
    s = next(s, 'pickup_acknowledged');
    s = next(s, 'return_analysed');
    s = next(s, 'settle_started');
    expect(next(s, 'captured')).toBe('settled_captured');
  });
  it('refuses to capture twice or skip the hold', () => {
    expect(() => next('settled_captured', 'settle_started')).toThrow(TransitionError);
    expect(canApply('booked', 'pickup_acknowledged')).toBe(false);
    expect(canApply('settled_void', 'captured')).toBe(false);
  });
});

describe('reauthorization window', () => {
  const base = { authorizationId: 'A', status: 'out' as const };
  const at = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  it('is needed after the 3-day honor period and before day 29', () => {
    expect(needsReauthorization({ ...base, authorizedAt: at(1) } as never)).toBe(false);
    expect(needsReauthorization({ ...base, authorizedAt: at(5) } as never)).toBe(true);
    expect(needsReauthorization({ ...base, authorizedAt: at(30) } as never)).toBe(false);
  });
});

describe('AI output validation', () => {
  it('rejects boxes with no area and out-of-range confidence', () => {
    const bad = { quality: { usable: true, reason: '' }, same_item: true, matched_preexisting: [], new_findings: [{ ...mark('x'), box_2d: [200, 200, 100, 100] }] };
    expect(DiffResult.safeParse(bad).success).toBe(false);
    expect(DiffResult.safeParse({ ...bad, new_findings: [{ ...mark('x'), confidence: 3 }] }).success).toBe(false);
  });
});

import { billableDays } from '../src/domain/money.js';
describe('rental fee days', () => {
  it('bills every started day, minimum one', () => {
    expect(billableDays('2026-11-14T10:00:00Z', '2026-11-16T10:00:00Z')).toBe(2);
    expect(billableDays('2026-11-14T10:00:00Z', '2026-11-16T11:00:00Z')).toBe(3);
    expect(billableDays('2026-11-14T10:00:00Z', '2026-11-14T12:00:00Z')).toBe(1);
  });
});
