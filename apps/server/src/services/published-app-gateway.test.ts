import { afterEach, describe, expect, it, vi } from "vitest";
import { PublishedAppGateway, staticObjectPath } from "./published-app-gateway.js";

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
});
