import { describe, expect, it } from "vitest";
import { UploadedImageUrlCache } from "./upload-url-cache";

describe("UploadedImageUrlCache", () => {
  it("expires stale entries on read", () => {
    const cache = new UploadedImageUrlCache({ ttlMs: 1000 });

    cache.set("a", "https://example.com/a", 0);

    expect(cache.get("a", 999)).toBe("https://example.com/a");
    expect(cache.get("a", 1001)).toBeNull();
    expect(cache.size()).toBe(0);
  });

  it("sweeps expired entries before inserting new ones", () => {
    const cache = new UploadedImageUrlCache({ ttlMs: 1000, maxEntries: 2 });

    cache.set("a", "https://example.com/a", 0);
    cache.set("b", "https://example.com/b", 1500);

    expect(cache.size()).toBe(1);
    expect(cache.get("a", 1500)).toBeNull();
    expect(cache.get("b", 1500)).toBe("https://example.com/b");
  });

  it("evicts the oldest entry when the cache exceeds its limit", () => {
    const cache = new UploadedImageUrlCache({ maxEntries: 2 });

    cache.set("a", "https://example.com/a", 0);
    cache.set("b", "https://example.com/b", 1);
    cache.set("c", "https://example.com/c", 2);

    expect(cache.size()).toBe(2);
    expect(cache.get("a", 2)).toBeNull();
    expect(cache.get("b", 2)).toBe("https://example.com/b");
    expect(cache.get("c", 2)).toBe("https://example.com/c");
  });
});
