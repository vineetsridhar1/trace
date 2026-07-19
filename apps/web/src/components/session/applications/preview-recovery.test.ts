import { describe, expect, it } from "vitest";
import type { SessionApplicationProcess } from "@trace/gql";
import { buildPreviewFixPrompt } from "./preview-recovery";

function process(overrides: Partial<SessionApplicationProcess> = {}): SessionApplicationProcess {
  return {
    id: "process-1",
    sessionGroupId: "group-1",
    appConfigId: "app",
    processConfigId: "dev",
    label: "Dev server",
    endpoints: [],
    status: "failed",
    runtimeInstanceId: null,
    startedAt: null,
    stoppedAt: null,
    exitCode: 1,
    lastError: null,
    ...overrides,
  };
}

describe("buildPreviewFixPrompt", () => {
  it("includes the process failure and managed-process constraint", () => {
    const prompt = buildPreviewFixPrompt(
      process({ lastError: "Preview process stopped after 3 automatic restart attempts" }),
    );

    expect(prompt).toContain("Dev server");
    expect(prompt).toContain("3 automatic restart attempts");
    expect(prompt).toContain("Do not start a detached or second dev server");
  });

  it("falls back to the exit code when the bridge has no error", () => {
    expect(buildPreviewFixPrompt(process({ exitCode: 137 }))).toContain("exited with code 137");
  });
});
