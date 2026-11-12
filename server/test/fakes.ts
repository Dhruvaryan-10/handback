import type { BaselineResult, DiffResult, Finding } from '../src/ai/schema.js';
import type { Photo, VisionInspector } from '../src/ai/gemini.js';
import type { PayPalClient } from '../src/paypal/client.js';
import { fromPayPalValue, toPayPalValue } from '../src/domain/money.js';

/** In-memory PayPal sandbox look-alike that honours PayPal-Request-Id idempotency. */
export class FakePayPal {
  calls: { op: string; args: unknown[] }[] = [];
  orders = new Map<string, { status: string; amount: number }>();
  auths = new Map<string, { status: string; amount: number }>();
  captures = new Map<string, { amount: number; refunded: number }>();
  private byRequestId = new Map<string, unknown>();
  private n = 0;
  failNextCapture = false;

  private once<T>(requestId: string, fn: () => T): T {
    if (this.byRequestId.has(requestId)) return this.byRequestId.get(requestId) as T;
    const v = fn();
    this.byRequestId.set(requestId, v);
    return v;
  }

  async createAuthorizeOrder(a: { rentalId: string; depositCents: number }) {
    this.calls.push({ op: 'createOrder', args: [a] });
    return this.once(`order-${a.rentalId}`, () => {
      const id = `ORDER${++this.n}`;
      this.orders.set(id, { status: 'CREATED', amount: a.depositCents });
      return { id, status: 'CREATED', links: [{ rel: 'payer-action', href: `https://sandbox.example/approve/${id}` }] };
    });
  }
  approve(orderId: string) {
    this.orders.get(orderId)!.status = 'APPROVED';
  }
  async getOrder(id: string) {
    const o = this.orders.get(id)!;
    return { id, status: o.status, links: [{ rel: 'payer-action', href: `https://sandbox.example/approve/${id}` }] };
  }
  async authorizeOrder(orderId: string) {
    this.calls.push({ op: 'authorize', args: [orderId] });
    return this.once(`authorize-${orderId}`, () => {
      const o = this.orders.get(orderId)!;
      o.status = 'COMPLETED';
      const id = `AUTH${++this.n}`;
      this.auths.set(id, { status: 'CREATED', amount: o.amount });
      return { id: orderId, status: 'COMPLETED', purchase_units: [{ payments: { authorizations: [{ id, status: 'CREATED', amount: { value: toPayPalValue(o.amount) } }] } }] };
    });
  }
  async captureAuthorization(authId: string, cents: number, requestId: string) {
    this.calls.push({ op: 'capture', args: [authId, cents, requestId] });
    if (this.failNextCapture) {
      this.failNextCapture = false;
      throw new Error('network down');
    }
    return this.once(requestId, () => {
      const a = this.auths.get(authId)!;
      if (a.status !== 'CREATED') throw new Error(`auth ${a.status}`);
      if (cents > a.amount) throw new Error('over capture');
      a.status = 'CAPTURED';
      const id = `CAP${++this.n}`;
      this.captures.set(id, { amount: cents, refunded: 0 });
      return { id, status: 'COMPLETED', amount: { value: toPayPalValue(cents), currency_code: 'USD' } };
    });
  }
  async voidAuthorization(authId: string, requestId: string) {
    this.calls.push({ op: 'void', args: [authId, requestId] });
    return this.once(requestId, () => {
      this.auths.get(authId)!.status = 'VOIDED';
      return {};
    });
  }
  async refundCapture(captureId: string, cents: number, requestId: string) {
    this.calls.push({ op: 'refund', args: [captureId, cents, requestId] });
    return this.once(requestId, () => {
      const c = this.captures.get(captureId)!;
      if (c.refunded + cents > c.amount) throw new Error('over refund');
      c.refunded += cents;
      return { id: `REF${++this.n}`, status: 'COMPLETED' };
    });
  }
  async reauthorize(authId: string, cents: number) {
    const id = `AUTH${++this.n}`;
    this.auths.set(id, { status: 'CREATED', amount: cents });
    this.auths.get(authId)!.status = 'REAUTHORIZED';
    return { id, status: 'CREATED' };
  }
  async verifyWebhook() {
    return true;
  }
  count(op: string) {
    return this.calls.filter((c) => c.op === op).length;
  }
  get asClient() {
    return this as unknown as PayPalClient;
  }
}

export const mark = (label: string, type: Finding['type'] = 'scratch', severity: Finding['severity'] = 'minor', confidence = 0.9): Finding => ({
  label,
  type,
  severity,
  confidence,
  box_2d: [100, 100, 200, 200],
});

/** Scripted inspector: baseline marks and new findings per angle. */
export class FakeInspector {
  enabled = true;
  constructor(
    public baselineMarks: Record<string, Finding[]> = {},
    public newFindings: Record<string, Finding[]> = {},
    public unusable: string[] = [],
  ) {}
  async baseline(p: Photo): Promise<BaselineResult> {
    return { quality: { usable: !this.unusable.includes(p.angle), reason: this.unusable.includes(p.angle) ? 'too dark' : '' }, marks: this.baselineMarks[p.angle] ?? [] };
  }
  async diff(_b: Photo, a: Photo, baseline: Finding[]): Promise<DiffResult> {
    return { quality: { usable: true, reason: '' }, same_item: true, new_findings: this.newFindings[a.angle] ?? [], matched_preexisting: baseline.map((m) => m.label) };
  }
  get asInspector() {
    return this as unknown as VisionInspector;
  }
}

/** Smallest thing that passes validation: a JPEG signature followed by padding. */
export const fakeJpegBase64 = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2048, 7)]).toString('base64');
export const photo = (angle: string): Photo => ({ angle, mimeType: 'image/jpeg', data: fakeJpegBase64 });

export { fromPayPalValue };
