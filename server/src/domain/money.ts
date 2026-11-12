/** All money is integer cents inside the app. Decimal strings only at the PayPal boundary. */
export type Cents = number;

export function toPayPalValue(cents: Cents): string {
  if (!Number.isInteger(cents) || cents < 0) throw new Error(`Invalid cents: ${cents}`);
  return (cents / 100).toFixed(2);
}

export function fromPayPalValue(value: string): Cents {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error(`Invalid PayPal amount: ${value}`);
  const [whole, frac = ''] = value.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

export function formatUSD(cents: Cents): string {
  return `$${toPayPalValue(cents)}`;
}

const DAY_MS = 86_400_000;
/** Whole days billed for a rental: any part day counts as a day, minimum one. */
export function billableDays(startsAt: string, endsAt: string): number {
  return Math.max(1, Math.ceil((Date.parse(endsAt) - Date.parse(startsAt)) / DAY_MS));
}
