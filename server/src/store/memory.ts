import type { Item, Rental, RentalEventRow, Store } from './types.js';

/** Single-process store for local dev, tests and the zero-config demo. Data resets on restart. */
export class MemoryStore implements Store {
  private items = new Map<string, Item>();
  private rentals = new Map<string, Rental>();
  private events: RentalEventRow[] = [];
  private webhooks = new Set<string>();
  private locks = new Map<string, Promise<unknown>>();

  async listItems() {
    return [...this.items.values()];
  }
  async getItem(id: string) {
    return this.items.get(id);
  }
  async upsertItem(item: Item) {
    this.items.set(item.id, structuredClone(item));
  }
  async listRentals() {
    return [...this.rentals.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((r) => structuredClone(r));
  }
  async getRental(id: string) {
    const r = this.rentals.get(id);
    return r ? structuredClone(r) : undefined;
  }
  async findRentalByOrder(orderId: string) {
    for (const r of this.rentals.values()) if (r.paypalOrderId === orderId) return structuredClone(r);
    return undefined;
  }
  async saveRental(r: Rental) {
    this.rentals.set(r.id, structuredClone({ ...r, updatedAt: new Date().toISOString() }));
  }
  async deleteRental(id: string) {
    this.rentals.delete(id);
    this.events = this.events.filter((e) => e.rentalId !== id);
  }
  async withRentalLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(id) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(fn);
    this.locks.set(id, run.catch(() => undefined));
    return run;
  }
  async logEvent(e: RentalEventRow) {
    this.events.push(e);
  }
  async listEvents(rentalId: string) {
    return this.events.filter((e) => e.rentalId === rentalId);
  }
  async listRecentEvents(limit: number) {
    return [...this.events].reverse().slice(0, limit);
  }
  async markWebhookSeen(eventId: string) {
    if (this.webhooks.has(eventId)) return false;
    this.webhooks.add(eventId);
    return true;
  }
}
