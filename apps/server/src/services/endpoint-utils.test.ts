import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bodyPreview,
  buildEndpointUrl,
  endpointPreviewBaseHost,
  extractEndpointKey,
  forwardableRequestHeaders,
  forwardableResponseHeaders,
  generateEndpointKey,
  isAllowedPreviewRequestOrigin,
  sanitizeHeaders,
  warnIfPreviewHostNotIsolated,
  webSocketProtocols,
} from "./endpoint-utils.js";

describe("endpoint utils", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("builds URLs from preview host configuration", () => {
    vi.stubEnv("TRACE_ENDPOINT_PREVIEW_BASE_HOST", "preview.example.test");
    vi.stubEnv("TRACE_ENDPOINT_PREVIEW_PUBLIC_SCHEME", "https");

    expect(endpointPreviewBaseHost()).toBe("preview.example.test");
    expect(buildEndpointUrl("abc123")).toBe("https://abc123.preview.example.test");
  });

  it("warns but does not fail when previews share the Trace registrable domain", () => {
    vi.stubEnv("TRACE_ENDPOINT_PREVIEW_BASE_HOST", "preview.trace.infra.opendoor.com");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(() =>
      warnIfPreviewHostNotIsolated("https://trace.infra.opendoor.com"),
    ).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
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

  it("rejects deeper subdomains so one endpoint isn't reachable from many origins", () => {
    vi.stubEnv("TRACE_ENDPOINT_PREVIEW_BASE_HOST", "preview.localhost");

    expect(extractEndpointKey("evil.abc123.preview.localhost")).toBeNull();
    expect(extractEndpointKey("abc123.preview.localhost")).toBe("abc123");
  });

  it("strips the Domain attribute from forwarded Set-Cookie", () => {
    expect(
      forwardableResponseHeaders({
        "set-cookie": ["sid=1; Path=/; Domain=preview.localhost; HttpOnly", "a=b"],
        "content-type": "text/html",
      }),
    ).toEqual({
      "set-cookie": ["sid=1; Path=/; HttpOnly", "a=b"],
      "content-type": "text/html",
    });
  });

  it("allows same-endpoint and Trace origins but rejects cross-site preview requests", () => {
    vi.stubEnv("TRACE_ENDPOINT_PREVIEW_BASE_HOST", "preview.localhost");
    vi.stubEnv("TRACE_WEB_URL", "https://app.trace.test");

    // No Origin (top-level navigation) is allowed.
    expect(isAllowedPreviewRequestOrigin(undefined, "abc123")).toBe(true);
    // The app's own origin (even with a differing port) is allowed.
    expect(isAllowedPreviewRequestOrigin("http://abc123.preview.localhost:4000", "abc123")).toBe(
      true,
    );
    // The Trace app origin (iframe embedder) is allowed.
    expect(isAllowedPreviewRequestOrigin("https://app.trace.test", "abc123")).toBe(true);
    // A different endpoint or an attacker origin is rejected.
    expect(isAllowedPreviewRequestOrigin("http://other.preview.localhost", "abc123")).toBe(false);
    expect(isAllowedPreviewRequestOrigin("https://evil.test", "abc123")).toBe(false);
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

  it("strips the endpoint preview cookie before forwarding", () => {
    expect(
      forwardableRequestHeaders({
        cookie: "__trace_endpoint_preview=jwt; app_sid=keep",
      }),
    ).toEqual({ cookie: "app_sid=keep" });
    expect(forwardableRequestHeaders({ cookie: "__trace_endpoint_preview=jwt" })).toEqual({});
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

  it("forces private preview requests to bypass cached application assets", () => {
    expect(
      forwardableRequestHeaders(
        {
          "cache-control": "max-age=0",
          pragma: "cache",
          "if-none-match": 'W/"stale"',
          "if-modified-since": "Sat, 01 Jan 2000 00:00:00 GMT",
          accept: "text/css",
        },
        { disableCache: true },
      ),
    ).toEqual({
      accept: "text/css",
      "cache-control": "no-cache",
      pragma: "no-cache",
    });
  });

  it("extracts websocket subprotocols before stripping handshake headers", () => {
    expect(
      webSocketProtocols({
        "sec-websocket-protocol": "vite-hmr, graphql-transport-ws, vite-hmr",
      }),
    ).toEqual(["vite-hmr", "graphql-transport-ws"]);
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

  it("prevents private preview responses from being reused after live edits", () => {
    expect(
      forwardableResponseHeaders(
        {
          "cache-control": "public, max-age=3600",
          etag: 'W/"old"',
          expires: "Sat, 01 Jan 2100 00:00:00 GMT",
          "last-modified": "Sat, 01 Jan 2000 00:00:00 GMT",
          "content-type": "text/css",
        },
        { disableCache: true },
      ),
    ).toEqual({
      "Cache-Control": "no-store",
      "content-type": "text/css",
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
