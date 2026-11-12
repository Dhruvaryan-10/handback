import { env, paypalBase } from '../config.js';
import { toPayPalValue, type Cents } from '../domain/money.js';

/**
 * Minimal PayPal REST client for the authorization-hold lifecycle.
 * Endpoints (sandbox base https://api-m.sandbox.paypal.com):
 *   POST /v1/oauth2/token
 *   POST /v2/checkout/orders                               (intent AUTHORIZE)
 *   POST /v2/checkout/orders/{id}/authorize
 *   GET  /v2/checkout/orders/{id}
 *   POST /v2/payments/authorizations/{id}/capture          (amount + final_capture)
 *   POST /v2/payments/authorizations/{id}/void
 *   POST /v2/payments/authorizations/{id}/reauthorize
 *   GET  /v2/payments/authorizations/{id}
 *   POST /v2/payments/captures/{id}/refund
 *   GET  /v2/payments/captures/{id}
 *   POST /v1/notifications/verify-webhook-signature
 * Every write carries a PayPal-Request-Id so a retry returns the original result instead of repeating it.
 */

export class PayPalError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
    public debugId?: string,
  ) {
    super(message);
  }
  /** PayPal puts the specific issue code in details[0].issue, e.g. INSTRUMENT_DECLINED. */
  get issue(): string | undefined {
    const b = this.body as { details?: { issue?: string }[]; name?: string } | undefined;
    return b?.details?.[0]?.issue ?? b?.name;
  }
}

export class PayPalNotConfiguredError extends Error {}

type Json = Record<string, unknown>;

export interface PayPalLink {
  href: string;
  rel: string;
  method?: string;
}

export interface OrderResult {
  id: string;
  status: string;
  links?: PayPalLink[];
  purchase_units?: {
    payments?: {
      authorizations?: { id: string; status: string; amount: { value: string }; expiration_time?: string }[];
    };
  }[];
}

export interface CaptureResult {
  id: string;
  status: 'COMPLETED' | 'PENDING' | 'DECLINED' | 'FAILED' | string;
  amount?: { value: string; currency_code: string };
  status_details?: { reason?: string };
}

export class PayPalClient {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private clientId = env.PAYPAL_CLIENT_ID,
    private secret = env.PAYPAL_CLIENT_SECRET,
    private base = paypalBase,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private async accessToken(force = false): Promise<string> {
    if (!force && this.token && Date.now() < this.token.expiresAt - 60_000) return this.token.value;
    if (!this.clientId || !this.secret) throw new PayPalNotConfiguredError('PayPal sandbox credentials are not configured');
    const res = await this.fetchImpl(`${this.base}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.secret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
    if (!res.ok || !body.access_token) throw new PayPalError('PayPal OAuth failed', res.status, body);
    this.token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3000) * 1000 };
    return this.token.value;
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: Json, requestId?: string): Promise<T> {
    const attempt = async (forceToken: boolean) => {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${await this.accessToken(forceToken)}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      };
      if (requestId) headers['PayPal-Request-Id'] = requestId;
      return this.fetchImpl(`${this.base}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    };
    let res = await attempt(false);
    if (res.status === 401) res = await attempt(true); // expired token: refresh once, same request id
    if (res.status >= 500 && requestId) res = await attempt(false); // safe: idempotent with the same id
    const text = await res.text();
    const parsed = text ? (JSON.parse(text) as unknown) : {};
    if (!res.ok) {
      throw new PayPalError(
        `PayPal ${method} ${path} failed with ${res.status}`,
        res.status,
        parsed,
        res.headers.get('paypal-debug-id') ?? undefined,
      );
    }
    return parsed as T;
  }

  /** Create an order that will only be authorized (held), never captured on approval. */
  createAuthorizeOrder(args: {
    rentalId: string;
    itemName: string;
    depositCents: Cents;
    returnUrl: string;
    cancelUrl: string;
  }): Promise<OrderResult> {
    const value = toPayPalValue(args.depositCents);
    return this.call<OrderResult>(
      'POST',
      '/v2/checkout/orders',
      {
        intent: 'AUTHORIZE',
        purchase_units: [
          {
            reference_id: args.rentalId,
            custom_id: args.rentalId,
            description: `Rental fee + refundable deposit: ${args.itemName}`.slice(0, 127),
            amount: { currency_code: 'USD', value, breakdown: { item_total: { currency_code: 'USD', value } } },
            items: [
              {
                name: `Deposit hold: ${args.itemName}`.slice(0, 127),
                quantity: '1',
                category: 'DIGITAL_GOODS',
                unit_amount: { currency_code: 'USD', value },
              },
            ],
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: 'Handback',
              shipping_preference: 'NO_SHIPPING',
              user_action: 'CONTINUE',
              return_url: args.returnUrl,
              cancel_url: args.cancelUrl,
            },
          },
        },
      },
      `order-${args.rentalId}`,
    );
  }

  getOrder(orderId: string): Promise<OrderResult> {
    return this.call<OrderResult>('GET', `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
  }

  /** After the renter approves, place the hold. Returns the order with its authorization. */
  authorizeOrder(orderId: string): Promise<OrderResult> {
    return this.call<OrderResult>('POST', `/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`, {}, `authorize-${orderId}`);
  }

  /** Capture the deduction and release the rest of the hold in the same call. */
  captureAuthorization(authorizationId: string, amountCents: Cents, requestId: string, noteToPayer?: string): Promise<CaptureResult> {
    return this.call<CaptureResult>(
      'POST',
      `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/capture`,
      {
        amount: { currency_code: 'USD', value: toPayPalValue(amountCents) },
        final_capture: true, // Payments v2 defaults this to false, which would leave the rest held
        ...(noteToPayer ? { note_to_payer: noteToPayer.slice(0, 255) } : {}),
      },
      requestId,
    );
  }

  voidAuthorization(authorizationId: string, requestId: string): Promise<Json> {
    return this.call<Json>('POST', `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`, {}, requestId);
  }

  /** Allowed from day 4 to day 29 after the original authorization; returns a NEW authorization id. */
  reauthorize(authorizationId: string, amountCents: Cents, requestId: string): Promise<{ id: string; status: string; expiration_time?: string }> {
    return this.call(
      'POST',
      `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/reauthorize`,
      { amount: { currency_code: 'USD', value: toPayPalValue(amountCents) } },
      requestId,
    );
  }

  getAuthorization(authorizationId: string): Promise<{ id: string; status: string; expiration_time?: string }> {
    return this.call('GET', `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}`);
  }

  refundCapture(captureId: string, amountCents: Cents, requestId: string, note?: string): Promise<{ id: string; status: string }> {
    return this.call(
      'POST',
      `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`,
      { amount: { currency_code: 'USD', value: toPayPalValue(amountCents) }, ...(note ? { note_to_payer: note.slice(0, 255) } : {}) },
      requestId,
    );
  }

  getCapture(captureId: string): Promise<CaptureResult> {
    return this.call<CaptureResult>('GET', `/v2/payments/captures/${encodeURIComponent(captureId)}`);
  }

  /** Verify a webhook with PayPal before acting on it. Returns true only for SUCCESS. */
  async verifyWebhook(headers: Record<string, string | string[] | undefined>, event: Json, webhookId = env.PAYPAL_WEBHOOK_ID): Promise<boolean> {
    if (!webhookId) return false;
    const h = (k: string) => {
      const v = headers[k];
      return Array.isArray(v) ? v[0] : v;
    };
    const result = await this.call<{ verification_status?: string }>('POST', '/v1/notifications/verify-webhook-signature', {
      auth_algo: h('paypal-auth-algo'),
      cert_url: h('paypal-cert-url'),
      transmission_id: h('paypal-transmission-id'),
      transmission_sig: h('paypal-transmission-sig'),
      transmission_time: h('paypal-transmission-time'),
      webhook_id: webhookId,
      webhook_event: event,
    });
    return result.verification_status === 'SUCCESS';
  }
}

export function approveLink(order: OrderResult): string | undefined {
  return order.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href;
}

export function firstAuthorization(order: OrderResult) {
  return order.purchase_units?.[0]?.payments?.authorizations?.[0];
}

export const paypal = new PayPalClient();
