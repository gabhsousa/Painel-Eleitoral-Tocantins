const FRESH_MS = 60_000;
const MAX_AGE_MS = 300_000;
const MAX_ENTRIES = 200;
const MAX_BYTES = 16 * 1024 * 1024;
const MAX_ENTRY_BYTES = 2 * 1024 * 1024;
const MAX_PENDING = 12;

type Entry = { createdAt: number; bytes: number; data: unknown };
type LoadOptions = { allowStale: boolean; onRefreshError: () => void };

export class QueryCapacityError extends Error {}

/** Bounded response cache with one loader per key, including background refreshes. */
export class QueryCache {
  private readonly entries = new Map<string, Entry>();
  private readonly pending = new Map<string, Promise<unknown>>();
  private bytes = 0;

  private evict(key: string) {
    this.bytes -= this.entries.get(key)?.bytes ?? 0;
    this.entries.delete(key);
  }

  save(key: string, data: unknown) {
    const bytes = Buffer.byteLength(JSON.stringify(data));
    this.evict(key);
    if (bytes > MAX_ENTRY_BYTES) return;
    while (this.entries.size >= MAX_ENTRIES || this.bytes + bytes > MAX_BYTES) {
      this.evict(this.entries.keys().next().value!);
    }
    this.entries.set(key, { createdAt: Date.now(), bytes, data });
    this.bytes += bytes;
  }

  private load(key: string, loader: () => Promise<unknown>) {
    const existing = this.pending.get(key);
    if (existing) return existing;
    if (this.pending.size >= MAX_PENDING) throw new QueryCapacityError();

    // Defer the loader so even synchronous failures share the registered promise.
    const work = Promise.resolve()
      .then(loader)
      .then((data) => {
        this.save(key, data);
        return data;
      })
      .finally(() => {
        if (this.pending.get(key) === work) this.pending.delete(key);
      });
    this.pending.set(key, work);
    return work;
  }

  async get(key: string, loader: () => Promise<unknown>, options: LoadOptions) {
    const entry = this.entries.get(key);
    const age = entry ? Date.now() - entry.createdAt : Infinity;
    if (entry && age < FRESH_MS) return entry.data;
    if (entry && options.allowStale && age < MAX_AGE_MS) {
      if (!this.pending.has(key) && this.pending.size < MAX_PENDING) {
        // Observe rejection separately; foreground waiters must still see it.
        void this.load(key, loader).catch(options.onRefreshError);
      }
      return entry.data;
    }
    if (entry) this.evict(key);
    return this.load(key, loader);
  }
}
