import { describe, expect, it } from "vitest";
import { getAllowedCorsOrigins, isCorsOriginAllowed } from "./cors.js";

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
});
