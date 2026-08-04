import { describe, expect, it } from "vitest";
import { sanitizeSessionOutput } from "./session-output-safety.js";

describe("sanitizeSessionOutput", () => {
  it("redacts credential fields and common token forms without changing usage counters", () => {
    const output = sanitizeSessionOutput({
      type: "assistant",
      apiKey: "top-secret",
      OPENAI_API_KEY: "provider-secret",
      message: {
        content: [
          {
            type: "text",
            text: "Authorization: Bearer abc.def.ghi and sk_test_1234567890123456",
          },
        ],
      },
      usage: { inputTokens: 12, outputTokens: 4 },
    });

    expect(output.apiKey).toBe("[redacted]");
    expect(output.OPENAI_API_KEY).toBe("[redacted]");
    expect(output.usage).toEqual({ inputTokens: 12, outputTokens: 4 });
    expect(JSON.stringify(output)).not.toContain("top-secret");
    expect(JSON.stringify(output)).not.toContain("provider-secret");
    expect(JSON.stringify(output)).not.toContain("1234567890123456");
  });

  it("replaces an event that remains too large after per-string truncation", () => {
    const output = sanitizeSessionOutput({
      type: "assistant",
      message: {
        content: Array.from({ length: 10 }, (_, index) => ({
          type: "text",
          text: `${index}:${"x".repeat(200 * 1024)}`,
        })),
      },
    });

    expect(output).toMatchObject({ type: "error", truncated: true });
    expect(Buffer.byteLength(JSON.stringify(output), "utf8")).toBeLessThan(1024 * 1024);
  });
});
