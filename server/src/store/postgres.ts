import pg from 'pg';
import type { Item, Rental, RentalEventRow, Store } from './types.js';

/**
 * Postgres store (Neon free tier in production). Rentals are stored as JSONB documents;
 * the per-rental lock is a transaction-scoped advisory lock, so it holds across server instances.
 */
export class PostgresStore implements Store {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 5, ssl: connectionString.includes('sslmode=') ? { rejectUnauthorized: false } : undefined });
  }

  async listItems() {
    const { rows } = await this.pool.query<{ doc: Item }>('select doc from items order by doc->>\'name\'');
    return rows.map((r) => r.doc);
  }
  async getItem(id: string) {
    const { rows } = await this.pool.query<{ doc: Item }>('select doc from items where id = $1', [id]);
    return rows[0]?.doc;
  }
  async upsertItem(item: Item) {
    await this.pool.query('insert into items (id, doc) values ($1, $2) on conflict (id) do update set doc = excluded.doc', [item.id, item]);
  }
  async listRentals() {
    const { rows } = await this.pool.query<{ doc: Rental }>('select doc from rentals order by created_at desc limit 200');
    return rows.map((r) => r.doc);
  }
  async getRental(id: string) {
    const { rows } = await this.pool.query<{ doc: Rental }>('select doc from rentals where id = $1', [id]);
    return rows[0]?.doc;
  }
  async findRentalByOrder(orderId: string) {
    const { rows } = await this.pool.query<{ doc: Rental }>('select doc from rentals where paypal_order_id = $1', [orderId]);
    return rows[0]?.doc;
  }
  async saveRental(r: Rental) {
    const doc = { ...r, updatedAt: new Date().toISOString() };
    await this.pool.query(
      `insert into rentals (id, paypal_order_id, status, created_at, doc) values ($1, $2, $3, $4, $5)
       on conflict (id) do update set paypal_order_id = excluded.paypal_order_id, status = excluded.status, doc = excluded.doc`,
      [r.id, r.paypalOrderId ?? null, r.status, r.createdAt, doc],
    );
  }
  async deleteRental(id: string) {
    await this.pool.query('delete from rental_events where rental_id = $1', [id]);
    await this.pool.query('delete from rentals where id = $1', [id]);
  }
  async withRentalLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query('select pg_advisory_xact_lock(hashtext($1))', [id]);
      const result = await fn();
      await client.query('commit');
      return result;
    } catch (e) {
      await client.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }
  async logEvent(e: RentalEventRow) {
    await this.pool.query('insert into rental_events (rental_id, at, kind, detail) values ($1, $2, $3, $4)', [e.rentalId, e.at, e.kind, e.detail]);
  }
  async listEvents(rentalId: string) {
    const { rows } = await this.pool.query<{ rental_id: string; at: Date; kind: string; detail: Record<string, unknown> }>(
      'select rental_id, at, kind, detail from rental_events where rental_id = $1 order by at',
      [rentalId],
    );
    return rows.map((r) => ({ rentalId: r.rental_id, at: r.at.toISOString(), kind: r.kind, detail: r.detail }));
  }
  async listRecentEvents(limit: number) {
    const { rows } = await this.pool.query<{ rental_id: string; at: Date; kind: string; detail: Record<string, unknown> }>(
      'select rental_id, at, kind, detail from rental_events order by at desc, id desc limit $1',
      [limit],
    );
    return rows.map((r) => ({ rentalId: r.rental_id, at: r.at.toISOString(), kind: r.kind, detail: r.detail }));
  }
  async markWebhookSeen(eventId: string) {
    const res = await this.pool.query('insert into webhook_events (id) values ($1) on conflict do nothing', [eventId]);
    return res.rowCount === 1;
  }
}
