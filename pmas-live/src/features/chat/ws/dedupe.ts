/** Bounded ring buffer for WebSocket event ID deduplication. */
export class BoundedEventDedupe {
  private readonly order: string[] = [];
  private readonly seen = new Set<string>();

  constructor(private readonly capacity = 2000) {}

  /** Returns true if this id is new (and records it). False if duplicate. */
  accept(id: string): boolean {
    if (!id) return true;
    if (this.seen.has(id)) return false;
    this.seen.add(id);
    this.order.push(id);
    while (this.order.length > this.capacity) {
      const old = this.order.shift();
      if (old) this.seen.delete(old);
    }
    return true;
  }

  clear(): void {
    this.order.length = 0;
    this.seen.clear();
  }
}
