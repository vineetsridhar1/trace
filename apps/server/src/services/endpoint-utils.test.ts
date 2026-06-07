import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bodyPreview,
  buildEndpointUrl,
  endpointPreviewBaseHost,
  extractEndpointKey,
  generateEndpointKey,
  sanitizeHeaders,
} from "./endpoint-utils.js";

describe("endpoint utils", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds URLs from preview host configuration", () => {
    vi.stubEnv("TRACE_ENDPOINT_PREVIEW_BASE_HOST", "preview.example.test");
    vi.stubEnv("TRACE_ENDPOINT_PREVIEW_PUBLIC_SCHEME", "https");

    expect(endpointPreviewBaseHost()).toBe("preview.example.test");
    expect(buildEndpointUrl("abc123")).toBe("https://abc123.preview.example.test");
  });

  it("extracts opaque endpoint keys from wildcard hosts", () => {
    vi.stubEnv("TRACE_ENDPOINT_PREVIEW_BASE_HOST", "preview.localhost");

    expect(extractEndpointKey("abc123.preview.localhost:4000")).toBe("abc123");
    expect(extractEndpointKey("preview.localhost")).toBeNull();
    expect(extractEndpointKey("trace.localhost")).toBeNull();
  });

  it("generates DNS-safe random keys", () => {
    expect(generateEndpointKey()).toMatch(/^[a-z2-7]{12}$/);
  });

  it("redacts sensitive headers", () => {
    expect(
      sanitizeHeaders({
        authorization: "Bearer secret",
        cookie: "sid=secret",
        "x-custom": "ok",
        "x-api-key": "secret",
      }),
    ).toEqual({
      authorization: "[redacted]",
      cookie: "[redacted]",
      "x-custom": "ok",
      "x-api-key": "[redacted]",
    });
  });

  it("truncates body previews", () => {
    const preview = bodyPreview(Buffer.from("abcdef"), 3);

    expect(preview).toEqual({
      preview: "abc",
      bytes: 6,
      truncated: true,
    });
  });
});
