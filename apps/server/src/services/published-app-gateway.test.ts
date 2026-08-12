import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PublishedAppGateway,
  publishedAppRequestHeaders,
  staticObjectPath,
} from "./published-app-gateway.js";

describe("PublishedAppGateway", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts exactly one safe app slug under the configured public host", () => {
    vi.stubEnv("TRACE_PUBLISHED_APP_BASE_HOST", "apps.trace.example.com");
    const gateway = new PublishedAppGateway();

    expect(gateway.extractSlug("notes-123.apps.trace.example.com")).toBe("notes-123");
    expect(gateway.extractSlug("notes-123.apps.trace.example.com:443")).toBe("notes-123");
    expect(gateway.extractSlug("evil.notes-123.apps.trace.example.com")).toBeNull();
    expect(gateway.extractSlug("trace.example.com")).toBeNull();
  });

  it("keeps static object reads inside the promoted release prefix", () => {
    expect(staticObjectPath("/")).toBe("index.html");
    expect(staticObjectPath("/assets/app.js")).toBe("assets/app.js");
    expect(() => staticObjectPath("/%2e%2e/secret")).toThrow("Invalid published app path");
    expect(() => staticObjectPath("/assets%5csecret")).toThrow("Invalid published app path");
  });

  it("does not expose proxied same-origin requests as cross-origin", () => {
    const headers = publishedAppRequestHeaders({
      host: "notes-123.apps.trace.example.com",
      origin: "https://notes-123.apps.trace.example.com",
    });

    expect(headers.get("x-forwarded-host")).toBe("notes-123.apps.trace.example.com");
    expect(headers.get("x-forwarded-proto")).toBe("https");
    expect(headers.get("origin")).toBeNull();
  });

  it("preserves cross-origin requests for the service app to authorize", () => {
    const headers = publishedAppRequestHeaders({
      host: "notes-123.apps.trace.example.com",
      origin: "https://other.example.com",
    });

    expect(headers.get("origin")).toBe("https://other.example.com");
  });
});
