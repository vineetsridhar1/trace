export const DEFAULT_UPLOADED_IMAGE_URL_CACHE_TTL_MS = 5 * 60 * 1000;
export const DEFAULT_UPLOADED_IMAGE_URL_CACHE_MAX_ENTRIES = 128;

interface UploadedImageUrlCacheEntry {
  url: string;
  fetchedAt: number;
}

interface UploadedImageUrlCacheOptions {
  ttlMs?: number;
  maxEntries?: number;
}

export class UploadedImageUrlCache {
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly entries = new Map<string, UploadedImageUrlCacheEntry>();

  constructor(options: UploadedImageUrlCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_UPLOADED_IMAGE_URL_CACHE_TTL_MS;
    this.maxEntries = options.maxEntries ?? DEFAULT_UPLOADED_IMAGE_URL_CACHE_MAX_ENTRIES;
  }

  get(key: string, now = Date.now()): string | null {
    this.evictExpired(now);
    const entry = this.entries.get(key);
    if (!entry) return null;

    // Refresh insertion order so overflow eviction keeps the newest entries.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.url;
  }

  set(key: string, url: string, now = Date.now()): void {
    this.evictExpired(now);
    if (this.entries.has(key)) {
      this.entries.delete(key);
    }
    this.entries.set(key, { url, fetchedAt: now });
    this.evictOverflow();
  }

  size(): number {
    return this.entries.size;
  }

  private evictExpired(now: number): void {
    for (const [key, entry] of this.entries) {
      if (now - entry.fetchedAt > this.ttlMs) {
        this.entries.delete(key);
      }
    }
  }

  private evictOverflow(): void {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (typeof oldestKey !== "string") return;
      this.entries.delete(oldestKey);
    }
  }
}
