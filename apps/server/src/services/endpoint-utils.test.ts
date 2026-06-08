import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bodyPreview,
  buildEndpointUrl,
  endpointPreviewBaseHost,
  extractEndpointKey,
  forwardableRequestHeaders,
  forwardableResponseHeaders,
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

  it("supports local preview hosts with explicit ports", () => {
    vi.stubEnv("TRACE_ENDPOINT_PREVIEW_BASE_HOST", "preview.localhost:4000");
    vi.stubEnv("TRACE_ENDPOINT_PREVIEW_PUBLIC_SCHEME", "http");

    expect(buildEndpointUrl("abc123")).toBe("http://abc123.preview.localhost:4000");
    expect(extractEndpointKey("abc123.preview.localhost:4000")).toBe("abc123");
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

  it("strips the Trace session cookie and auth headers before forwarding", () => {
    expect(
      forwardableRequestHeaders({
        authorization: "Bearer trace-secret",
        "proxy-authorization": "Basic x",
        cookie: "trace_token=secret; app_sid=keep",
        connection: "keep-alive",
        "content-type": "application/json",
        host: "abc.preview.localhost",
      }),
    ).toEqual({
      cookie: "app_sid=keep",
      "content-type": "application/json",
      host: "abc.preview.localhost",
    });
  });

  it("drops the cookie header entirely when only the Trace token is present", () => {
    expect(forwardableRequestHeaders({ cookie: "trace_token=secret" })).toEqual({});
  });

  it("drops websocket handshake headers when forwarding upgrades", () => {
    expect(
      forwardableRequestHeaders(
        {
          host: "abc.preview.localhost",
          upgrade: "websocket",
          "sec-websocket-key": "abc",
          "x-app": "ok",
        },
        { websocket: true },
      ),
    ).toEqual({ "x-app": "ok" });
  });

  it("strips hop-by-hop headers from upstream responses", () => {
    expect(
      forwardableResponseHeaders({
        "content-type": "text/html",
        connection: "close",
        "transfer-encoding": "chunked",
      }),
    ).toEqual({ "content-type": "text/html" });
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
