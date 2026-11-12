import type { Finding } from '../ai/schema.js';
import { DAMAGE_TYPES, SEVERITIES } from '../ai/schema.js';
import type { Cents } from './money.js';

export type PriceList = Record<(typeof DAMAGE_TYPES)[number], Record<(typeof SEVERITIES)[number], Cents>>;

export interface DeductionLine {
  angle: string;
  label: string;
  type: Finding['type'];
  severity: Finding['severity'];
  amountCents: Cents;
  confidence: number;
  needsReview: boolean;
  box_2d: number[];
}

export interface Deduction {
  lines: DeductionLine[];
  /** sum of priced lines (excluding lines that need review), capped at the hold */
  totalCents: Cents;
  uncappedCents: Cents;
  capped: boolean;
  needsReview: boolean;
}

/**
 * Turns AI findings into money. The AI never sets an amount: every number here comes
 * from the shop's own price list, and the total can never exceed the authorized hold.
 */
export function computeDeduction(
  findingsByAngle: Record<string, Finding[]>,
  priceList: PriceList,
  holdCents: Cents,
  confidenceThreshold: number,
): Deduction {
  const lines: DeductionLine[] = [];
  for (const [angle, findings] of Object.entries(findingsByAngle)) {
    for (const f of findings) {
      const needsReview = f.confidence < confidenceThreshold;
      lines.push({
        angle,
        label: f.label,
        type: f.type,
        severity: f.severity,
        amountCents: priceList[f.type][f.severity],
        confidence: f.confidence,
        needsReview,
        box_2d: f.box_2d,
      });
    }
  }
  const uncappedCents = lines.filter((l) => !l.needsReview).reduce((s, l) => s + l.amountCents, 0);
  const totalCents = Math.min(uncappedCents, holdCents);
  return {
    lines,
    totalCents,
    uncappedCents,
    capped: uncappedCents > holdCents,
    needsReview: lines.some((l) => l.needsReview),
  };
}

/** Recompute a total from owner-approved lines, re-applying the cap. Used right before capture. */
export function approvedTotal(lines: Pick<DeductionLine, 'amountCents'>[], holdCents: Cents): Cents {
  for (const l of lines) {
    if (!Number.isInteger(l.amountCents) || l.amountCents < 0) throw new Error('Line amounts must be non-negative cents');
  }
  return Math.min(lines.reduce((s, l) => s + l.amountCents, 0), holdCents);
}
