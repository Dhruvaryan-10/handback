import type { Finding } from '../ai/schema.js';
import type { DeductionLine, PriceList } from '../domain/pricing.js';
import type { RentalStatus } from '../domain/stateMachine.js';
import type { Cents } from '../domain/money.js';

export interface Item {
  id: string;
  name: string;
  depositCents: Cents;
  /** what the shop charges per day of lending */
  dailyRateCents: Cents;
  category?: string;
  angles: string[];
  priceList: PriceList;
}

export interface StoredPhoto {
  angle: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  data: string;
}

export interface Rental {
  id: string;
  itemId: string;
  renterName: string;
  status: RentalStatus;
  /** refundable security deposit: only new damage is ever taken from this part */
  depositCents: Cents;
  /** rental fee for the lending period (days x daily rate); charged at return */
  rentalFeeCents?: Cents;
  startsAt: string;
  endsAt: string;
  paypalOrderId?: string;
  authorizationId?: string;
  authorizedAt?: string;
  captureId?: string;
  capturedCents?: Cents;
  refundedCents?: Cents;
  pickupPhotos: StoredPhoto[];
  baseline: Record<string, Finding[]>;
  baselineAcknowledgedAt?: string;
  returnPhotos: StoredPhoto[];
  proposal?: { lines: DeductionLine[]; totalCents: Cents; capped: boolean; needsReview: boolean; matchedPreexisting: Record<string, string[]> };
  settlement?: { lines: DeductionLine[]; totalCents: Cents; feeCents?: Cents; damageCents?: Cents; approvedAt: string };
  createdAt: string;
  updatedAt: string;
}

export interface RentalEventRow {
  rentalId: string;
  at: string;
  kind: string;
  detail: Record<string, unknown>;
}

export interface Store {
  listItems(): Promise<Item[]>;
  getItem(id: string): Promise<Item | undefined>;
  upsertItem(item: Item): Promise<void>;
  listRentals(): Promise<Rental[]>;
  getRental(id: string): Promise<Rental | undefined>;
  findRentalByOrder(orderId: string): Promise<Rental | undefined>;
  saveRental(r: Rental): Promise<void>;
  /** removes the rental and its activity log */
  deleteRental(id: string): Promise<void>;
  /** Runs fn while holding an exclusive per-rental lock (no double capture on double tap). */
  withRentalLock<T>(id: string, fn: () => Promise<T>): Promise<T>;
  logEvent(e: RentalEventRow): Promise<void>;
  listEvents(rentalId: string): Promise<RentalEventRow[]>;
  /** newest first, across all rentals */
  listRecentEvents(limit: number): Promise<RentalEventRow[]>;
  /** returns false if this webhook event id was already processed */
  markWebhookSeen(eventId: string): Promise<boolean>;
}
