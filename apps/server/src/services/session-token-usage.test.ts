import { beforeEach, describe, expect, it, vi } from "vitest";
import { estimateSessionEventTokens, estimateTextTokens } from "@trace/shared";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

import { prisma } from "../lib/db.js";
import { getSessionContextMetrics } from "./session-token-usage.js";

const prismaMock = prisma as any;

describe("session token usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("estimates assistant session output including tool blocks", () => {
    expect(
      estimateSessionEventTokens("session_output", {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "Planning the change" },
            { type: "tool_use", name: "Read", input: { file_path: "src/app.ts" } },
            { type: "tool_result", name: "Read", content: "file contents" },
          ],
        },
      }),
    ).toBeGreaterThan(0);
  });

  it("includes replayed source-session context when the child session started without a prompt", async () => {
    prismaMock.event.findMany
      .mockResolvedValueOnce([
        {
          eventType: "session_started",
          payload: { prompt: null, sourceSessionId: "source-1" },
        },
        {
          eventType: "message_sent",
          payload: { text: "Continue from there" },
        },
      ])
      .mockResolvedValueOnce([
        {
          eventType: "session_started",
          payload: { prompt: "Investigate the regression" },
        },
        {
          eventType: "session_output",
          payload: {
            type: "assistant",
            message: {
              content: [{ type: "text", text: "Found the failing query path" }],
            },
          },
        },
      ]);

    const metrics = await getSessionContextMetrics({
      sessionId: "child-1",
      model: "claude-sonnet-4-6",
    });

    const expected =
      estimateTextTokens("Continue from there")
      + estimateTextTokens("Investigate the regression")
      + estimateTextTokens("Found the failing query path");

    expect(metrics.estimatedContextTokens).toBe(expected);
    expect(metrics.modelContextWindowTokens).toBe(200_000);
    expect(metrics.contextWindowUtilization).toBe(expected / 200_000);
  });
});
