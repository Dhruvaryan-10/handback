export type Severity = 'minor' | 'moderate' | 'severe';
export interface Finding {
  label: string;
  type: string;
  severity: Severity;
  box_2d: number[];
  confidence: number;
}
export interface Line extends Finding {
  angle: string;
  amountCents: number;
  needsReview: boolean;
}
export interface Item {
  id: string;
  name: string;
  depositCents: number;
  dailyRateCents: number;
  category?: string;
  angles: string[];
}
export interface Rental {
  id: string;
  itemId: string;
  renterName: string;
  status: string;
  /** refundable security deposit */
  depositCents: number;
  /** lending fee: days x daily rate */
  rentalFeeCents?: number;
  /** authorized on PayPal = fee + deposit */
  holdCents?: number;
  startsAt: string;
  endsAt: string;
  paypalOrderId?: string;
  authorizationId?: string;
  captureId?: string;
  capturedCents?: number;
  refundedCents?: number;
  pickupPhotos: { angle: string }[];
  returnPhotos: { angle: string }[];
  baseline: Record<string, Finding[]>;
  baselineAcknowledgedAt?: string;
  proposal?: { lines: Line[]; totalCents: number; capped: boolean; needsReview: boolean; matchedPreexisting: Record<string, string[]> };
  settlement?: { lines: Line[]; totalCents: number; feeCents?: number; damageCents?: number };
}
export interface RentalEvent {
  rentalId?: string;
  at: string;
  kind: string;
  detail: Record<string, unknown>;
}
export interface Config {
  demo?: boolean;
  paypalClientId: string | null;
  features: { paypal: boolean; ai: boolean; db: boolean; webhooks: boolean };
}
export interface Photo {
  angle: string;
  mimeType: 'image/jpeg';
  data: string;
}

/** "Try demo" switch: sample rentals with simulated PayPal + AI, served from a separate workspace. */
export function isDemoMode() {
  try {
    return localStorage.getItem('handback-mode') === 'demo';
  } catch {
    return false;
  }
}
export const apiBase = () => (isDemoMode() ? '/demo-api' : '/api');
export function setDemoMode(on: boolean, to = '/app') {
  try {
    if (on) localStorage.setItem('handback-mode', 'demo');
    else localStorage.removeItem('handback-mode');
  } catch {
    /* ignore */
  }
  window.location.assign(to);
}

/** PayPal hold for a rental: rental fee + refundable deposit. */
export const holdOf = (r: Pick<Rental, 'depositCents' | 'rentalFeeCents' | 'holdCents'>) => r.holdCents ?? r.depositCents + (r.rentalFeeCents ?? 0);

export const usd = (c: number) => (c < 0 ? '-' : '') + '$' + (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function shopToken(): string {
  try {
    const saved = localStorage.getItem('handback-shop-token');
    if (saved) return saved;
  } catch {
    /* storage unavailable */
  }
  const entered = window.prompt('Shop approval token (SHOP_ADMIN_TOKEN from .env; local default: dev-shop-token):') ?? '';
  try {
    localStorage.setItem('handback-shop-token', entered);
  } catch {
    /* storage unavailable */
  }
  return entered;
}

async function req<T>(method: string, path: string, body?: unknown, shop = false): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (shop) headers['x-shop-token'] = shopToken();
  const res = await fetch(`${apiBase()}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && shop) {
      try {
        localStorage.removeItem('handback-shop-token');
      } catch {
        /* ignore */
      }
    }
    throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  config: () => req<Config>('GET', '/config'),
  demoApprove: (id: string) => req<unknown>('POST', `/demo/rentals/${id}/approve`),
  items: () => req<Item[]>('GET', '/items'),
  events: (limit = 100) => req<RentalEvent[]>('GET', `/events?limit=${limit}`),
  rentals: () => req<Rental[]>('GET', '/rentals'),
  rental: (id: string) => req<{ rental: Rental; item: Item; events: RentalEvent[] }>('GET', `/rentals/${id}`),
  createRental: (b: { itemId: string; renterName: string; startsAt: string; endsAt: string }) => req<Rental>('POST', '/rentals', b),
  createOrder: (id: string) => req<{ orderId: string; approveUrl?: string }>('POST', `/rentals/${id}/paypal/order`),
  authorize: (id: string) => req<Rental>('POST', `/rentals/${id}/paypal/authorize`),
  pickup: (id: string, photos: Photo[]) =>
    req<{ ok: true; baseline: Record<string, Finding[]> } | { ok: false; retake: string[] }>('POST', `/rentals/${id}/pickup`, { photos }),
  acknowledge: (id: string) => req<Rental>('POST', `/rentals/${id}/acknowledge`),
  returnItem: (id: string, photos: Photo[]) =>
    req<{ ok: true; proposal: NonNullable<Rental['proposal']> } | { ok: false; retake: string[] }>('POST', `/rentals/${id}/return`, { photos }),
  settle: (id: string, lines: Line[]) => req<Rental>('POST', `/rentals/${id}/settle`, { lines }, true),
  refund: (id: string, amountCents: number, reason: string) => req<Rental>('POST', `/rentals/${id}/refund`, { amountCents, reason }, true),
  cancel: (id: string) => req<Rental>('POST', `/rentals/${id}/cancel`, {}, true),
  remove: (id: string) => req<{ deleted: string }>('DELETE', `/rentals/${id}`, undefined, true),
};

/** Resize to max 1600 px and re-encode as JPEG so each photo is roughly 200-400 KB. */
export async function compress(file: File, angle: string): Promise<Photo> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  return { angle, mimeType: 'image/jpeg', data: dataUrl.split(',')[1]! };
}
