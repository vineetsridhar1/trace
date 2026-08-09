import { createHmac } from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NangoConnectionProvider } from "./nango-connection-provider.js";

describe("NangoConnectionProvider", () => {
  afterEach(() => {
    delete process.env.NANGO_WEBHOOK_SIGNING_KEY;
    delete process.env.NANGO_SECRET_KEY;
    vi.unstubAllGlobals();
  });

  it("accepts only the HMAC-SHA256 signature for the exact webhook body", () => {
    process.env.NANGO_WEBHOOK_SIGNING_KEY = "webhook-secret";
    const body = Buffer.from('{"type":"auth"}');
    const signature = createHmac("sha256", "webhook-secret").update(body).digest("hex");
    const provider = new NangoConnectionProvider();

    expect(provider.verifyWebhook(body, signature)).toBe(true);
    expect(provider.verifyWebhook(Buffer.from('{"type":"sync"}'), signature)).toBe(false);
    expect(provider.verifyWebhook(body, "invalid")).toBe(false);
  });

  it("retries only read-only provider requests", async () => {
    process.env.NANGO_SECRET_KEY = "secret";
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new NangoConnectionProvider();
    const base = {
      connectionId: "connection-1",
      providerConfigKey: "github",
      path: "/user",
      query: null,
      contentType: "application/json",
      body: Buffer.from("{}"),
    };

    await provider.proxy({ ...base, method: "GET" });
    await provider.proxy({ ...base, method: "POST" });

    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("Retries")).toBe("2");
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("Retries")).toBeNull();
  });
});
