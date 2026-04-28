import { describe, expect, it } from "vitest";
import {
  getAllowedCorsOrigins,
  getRequestOrigin,
  isAllowedBrowserOrigin,
  isCorsOriginAllowed,
  shouldRejectCredentialedBrowserUpgrade,
} from "./cors.js";

describe("cors helpers", () => {
  it("allows explicit configured origins and rejects others", () => {
    const allowed = getAllowedCorsOrigins({
      localMode: false,
      nodeEnv: "production",
      traceWebUrl: "https://app.trace.test",
      corsAllowedOrigins: "https://staging.trace.test",
    });

    expect(isCorsOriginAllowed(allowed, "https://app.trace.test")).toBe(true);
    expect(isCorsOriginAllowed(allowed, "https://staging.trace.test")).toBe(true);
    expect(isCorsOriginAllowed(allowed, "https://evil.trace.test")).toBe(false);
  });

  it("fails closed in production when no explicit origins are configured", () => {
    expect(() =>
      getAllowedCorsOrigins({
        localMode: false,
        nodeEnv: "production",
      }),
    ).toThrow("Explicit CORS origins are required in production");
  });

  it("allows localhost defaults outside production", () => {
    const allowed = getAllowedCorsOrigins({
      localMode: false,
      nodeEnv: "development",
    });

    expect(allowed.has("http://localhost:3000")).toBe(true);
    expect(allowed.has("http://127.0.0.1:3000")).toBe(true);
  });

  it("extracts request origin from origin before referer", () => {
    expect(
      getRequestOrigin({
        origin: "https://app.trace.test",
        referer: "https://other.trace.test/settings",
      }),
    ).toBe("https://app.trace.test");
    expect(getRequestOrigin({ referer: "https://app.trace.test/settings" })).toBe(
      "https://app.trace.test",
    );
  });

  it("requires an explicit browser origin for cookie-authenticated unsafe requests", () => {
    const allowed = new Set(["https://app.trace.test"]);

    expect(isAllowedBrowserOrigin(allowed, { origin: "https://app.trace.test" })).toBe(true);
    expect(isAllowedBrowserOrigin(allowed, { referer: "https://app.trace.test/settings" })).toBe(
      true,
    );
    expect(isAllowedBrowserOrigin(allowed, { origin: "https://evil.trace.test" })).toBe(false);
    expect(isAllowedBrowserOrigin(allowed, {})).toBe(false);
  });

  it("rejects browser websocket upgrades only when session cookies are exposed cross-origin", () => {
    const allowed = new Set(["https://app.trace.test"]);

    expect(
      shouldRejectCredentialedBrowserUpgrade(allowed, {
        origin: "https://evil.trace.test",
        cookie: "trace_token=session-token",
      }),
    ).toBe(true);
    expect(
      shouldRejectCredentialedBrowserUpgrade(allowed, {
        origin: "https://app.trace.test",
        cookie: "trace_token=session-token",
      }),
    ).toBe(false);
    expect(
      shouldRejectCredentialedBrowserUpgrade(allowed, {
        origin: "http://localhost:8081",
      }),
    ).toBe(false);
  });
});
