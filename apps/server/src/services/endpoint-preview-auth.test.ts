import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createEndpointPreviewToken,
  endpointPreviewCookieHeader,
  endpointPreviewTokenFromCookie,
  verifyEndpointPreviewToken,
} from "./endpoint-preview-auth.js";

describe("endpoint preview auth", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips a short-lived endpoint-scoped credential through its cookie", () => {
    const credential = createEndpointPreviewToken({
      userId: "user-1",
      organizationId: "org-1",
      endpointId: "endpoint-1",
    });
    const cookie = endpointPreviewCookieHeader(credential.token, credential.expiresAt);
    const token = endpointPreviewTokenFromCookie(cookie);

    expect(token).toBe(credential.token);
    expect(verifyEndpointPreviewToken(token ?? "")).toMatchObject({
      userId: "user-1",
      organizationId: "org-1",
      endpointId: "endpoint-1",
    });
  });

  it("rejects malformed credentials", () => {
    expect(verifyEndpointPreviewToken("not-a-token")).toBeNull();
  });

  it("allows the preview cookie in a local cross-site iframe", () => {
    vi.stubEnv("TRACE_ENDPOINT_PREVIEW_BASE_HOST", "preview.localhost:4000");
    vi.stubEnv("TRACE_ENDPOINT_PREVIEW_PUBLIC_SCHEME", "http");

    const cookie = endpointPreviewCookieHeader("token", new Date("2030-01-01T00:00:00Z"));

    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=None");
    expect(cookie).toContain("Partitioned");
    expect(cookie).not.toContain("SameSite=Lax");
  });

  it("allows the preview cookie in a deployed cross-site iframe", () => {
    vi.stubEnv("TRACE_ENDPOINT_PREVIEW_BASE_HOST", "preview.trace.example");
    vi.stubEnv("TRACE_ENDPOINT_PREVIEW_PUBLIC_SCHEME", "https");

    const cookie = endpointPreviewCookieHeader("token", new Date("2030-01-01T00:00:00Z"));

    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=None");
    expect(cookie).toContain("Partitioned");
  });

  it("does not mark cookies secure on a non-local HTTP preview host", () => {
    vi.stubEnv("TRACE_ENDPOINT_PREVIEW_BASE_HOST", "preview.example.test");
    vi.stubEnv("TRACE_ENDPOINT_PREVIEW_PUBLIC_SCHEME", "http");

    const cookie = endpointPreviewCookieHeader("token", new Date("2030-01-01T00:00:00Z"));

    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
    expect(cookie).not.toContain("Partitioned");
  });
});
