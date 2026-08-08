import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  cleanupPlaywrightInvocationSession,
  createPlaywrightInvocationSession,
} from "./playwright-session.js";

describe("Playwright invocation sessions", () => {
  it("derives bounded isolated state from the invocation ID", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "trace-playwright-test-"));
    const first = await createPlaywrightInvocationSession({
      invocationId: "invocation/with unsafe characters and a very long suffix".repeat(4),
      outputRoot,
      configPath: "/trace/playwright.json",
    });
    const second = await createPlaywrightInvocationSession({
      invocationId: "another-invocation",
      outputRoot,
    });

    expect(first.sessionName).toMatch(/^trace-[a-f0-9]{32}$/);
    expect(first.sessionName).not.toBe(second.sessionName);
    expect(first.outputDir).not.toBe(second.outputDir);
    expect(first.env).toMatchObject({
      PLAYWRIGHT_CLI_CONFIG: "/trace/playwright.json",
      PLAYWRIGHT_CLI_SESSION: first.sessionName,
      PLAYWRIGHT_MCP_EXECUTABLE_PATH: "/usr/bin/chromium",
      PLAYWRIGHT_MCP_ISOLATED: "true",
      PLAYWRIGHT_MCP_OUTPUT_DIR: first.outputDir,
      TRACE_BROWSER_VIDEO_DIR: first.outputDir,
      TRACE_BROWSER_VIDEO_VALIDATE: "/usr/local/bin/trace-browser-video-validate",
    });
  });

  it("closes only the named session and removes its output", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "trace-playwright-test-"));
    const session = await createPlaywrightInvocationSession({
      invocationId: "cleanup-invocation",
      outputRoot,
    });
    const run = vi.fn().mockRejectedValueOnce(new Error("already closed")).mockResolvedValue({});

    await cleanupPlaywrightInvocationSession(session, { run });

    expect(run).toHaveBeenNthCalledWith(
      1,
      "playwright-cli",
      ["close"],
      expect.objectContaining({ PLAYWRIGHT_CLI_SESSION: session.sessionName }),
    );
    expect(run).toHaveBeenNthCalledWith(2, "playwright-cli", ["delete-data"], expect.any(Object));
    await expect(stat(session.outputDir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects an empty invocation ID before creating state", async () => {
    await expect(createPlaywrightInvocationSession({ invocationId: "  " })).rejects.toThrow(
      "Trace invocation ID is required",
    );
  });

  it("keeps abort cleanup best-effort when processes and storage are already unavailable", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "trace-playwright-test-"));
    const session = await createPlaywrightInvocationSession({
      invocationId: "failed-cleanup-invocation",
      outputRoot,
    });

    await expect(
      cleanupPlaywrightInvocationSession(session, {
        run: vi.fn().mockRejectedValue(new Error("CLI unavailable")),
        remove: vi.fn().mockRejectedValue(new Error("storage unavailable")),
      }),
    ).resolves.toBeUndefined();
    await rm(outputRoot, { recursive: true, force: true });
  });
});
