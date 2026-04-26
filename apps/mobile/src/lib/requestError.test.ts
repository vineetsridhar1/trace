import { describe, expect, it } from "vitest";
import { isOfflineError, isRateLimitError, userFacingError } from "./requestError";

describe("requestError", () => {
  it("normalizes 429s into the shared copy", () => {
    expect(isRateLimitError(new Error("GraphQL Error: 429 Too Many Requests"))).toBe(true);
    expect(userFacingError(new Error("429"), "fallback")).toBe(
      "Too many requests. Try again shortly.",
    );
  });

  it("normalizes offline failures into retryable copy", () => {
    expect(isOfflineError(new Error("Network request failed"))).toBe(true);
    expect(userFacingError(new Error("fetch failed"), "fallback")).toBe(
      "No internet connection. Try again once you're back online.",
    );
  });

  it("falls back to the raw message for non-special cases", () => {
    expect(userFacingError(new Error("Server exploded"), "fallback")).toBe("Server exploded");
  });
});
