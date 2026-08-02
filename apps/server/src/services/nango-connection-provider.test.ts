import { createHmac } from "crypto";
import { afterEach, describe, expect, it } from "vitest";
import { NangoConnectionProvider } from "./nango-connection-provider.js";

describe("NangoConnectionProvider", () => {
  afterEach(() => {
    delete process.env.NANGO_WEBHOOK_SIGNING_KEY;
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
});
