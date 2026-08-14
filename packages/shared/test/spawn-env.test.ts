import { chmodSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { buildChildProcessEnv } from "../src/adapters/spawn-env.js";

describe("buildChildProcessEnv", () => {
  it("drops oversized non-essential values", () => {
    const env = buildChildProcessEnv({
      HOME: "/home/coder",
      PATH: "/usr/bin",
      AI_GATEWAY_API_KEY: "sk-gateway",
      OPENAI_API_KEY: "sk-test",
      HUGE_PAYLOAD: "x".repeat(20 * 1024),
    });

    expect(env.HOME).toBe("/home/coder");
    // PATH is augmented with common install dirs so spawned CLIs resolve even
    // when the launching process has a narrower PATH than the user's shell.
    expect(env.PATH?.split(":")).toContain("/usr/bin");
    expect(env.PATH?.split(":")).toContain("/home/coder/.local/bin");
    expect(env.OPENAI_API_KEY).toBe("sk-test");
    expect(env.HUGE_PAYLOAD).toBeUndefined();
  });

  it("trims largest non-essential values until the environment is bounded", () => {
    const env = buildChildProcessEnv({
      HOME: "/home/coder",
      PATH: "/usr/bin",
      AI_GATEWAY_API_KEY: "sk-gateway",
      OPENAI_API_KEY: "sk-test",
      KEEP_ME: "short",
      LARGE_ONE: "a".repeat(15 * 1024),
      LARGE_TWO: "b".repeat(15 * 1024),
      LARGE_THREE: "c".repeat(15 * 1024),
      LARGE_FOUR: "d".repeat(15 * 1024),
      LARGE_FIVE: "e".repeat(15 * 1024),
    });

    expect(env.HOME).toBe("/home/coder");
    expect(env.PATH?.split(":")).toContain("/usr/bin");
    expect(env.OPENAI_API_KEY).toBe("sk-test");
    expect(env.KEEP_ME).toBe("short");
    expect(Object.keys(env).some((key) => key.startsWith("LARGE_"))).toBe(true);
    expect(Object.values(env).join("").length).toBeLessThan(64 * 1024);
  });

  it("keeps tool credentials even before dropping larger non-essential values", () => {
    const env = buildChildProcessEnv({
      HOME: "/home/coder",
      PATH: "/usr/bin",
      AI_GATEWAY_API_KEY: "sk-gateway",
      OPENAI_API_KEY: "sk-test",
      ANTHROPIC_API_KEY: "sk-ant-test",
      PATH: "/trace/runtime/bin:/usr/bin",
      TRACE_API_URL: "https://trace.example/",
      TRACE_INVOCATION_TOKEN: "trace-token",
      TRACE_SKILLS_DIR: "/trace/runtime/skills",
      PLAYWRIGHT_CLI_SESSION: "trace-123",
      PLAYWRIGHT_MCP_OUTPUT_DIR: "/tmp/trace-playwright/123",
      LARGE_ONE: "a".repeat(15 * 1024),
      LARGE_TWO: "b".repeat(15 * 1024),
      LARGE_THREE: "c".repeat(15 * 1024),
      LARGE_FOUR: "d".repeat(15 * 1024),
      LARGE_FIVE: "e".repeat(15 * 1024),
    });

    expect(env.OPENAI_API_KEY).toBe("sk-test");
    expect(env.ANTHROPIC_API_KEY).toBe("sk-ant-test");
    expect(env.PATH?.split(":")).toContain("/trace/runtime/bin");
    expect(env.TRACE_API_URL).toBe("https://trace.example/");
    expect(env.TRACE_INVOCATION_TOKEN).toBe("trace-token");
    expect(env.TRACE_SKILLS_DIR).toBe("/trace/runtime/skills");
    expect(env.PLAYWRIGHT_CLI_SESSION).toBe("trace-123");
    expect(env.PLAYWRIGHT_MCP_OUTPUT_DIR).toBe("/tmp/trace-playwright/123");
  });

  it("loads the od-ai key when the GUI environment does not have it", () => {
    const binDir = mkdtempSync(join(tmpdir(), "trace-od-ai-"));
    const keyHelper = join(binDir, "od-ai-key");
    writeFileSync(keyHelper, "#!/bin/sh\nprintf 'sk-gateway\\n'\n");
    chmodSync(keyHelper, 0o755);

    const env = buildChildProcessEnv({ HOME: "/home/coder", PATH: binDir });

    expect(env.AI_GATEWAY_API_KEY).toBe("sk-gateway");
  });

  it("loads the helper configured by the Homebrew od-ai wrapper", () => {
    const binDir = mkdtempSync(join(tmpdir(), "trace-od-ai-wrapper-"));
    const keyHelper = join(binDir, "key-helper");
    const odAi = join(binDir, "od-ai");
    writeFileSync(keyHelper, "#!/bin/sh\nprintf 'sk-homebrew\n'\n");
    writeFileSync(odAi, `#!/bin/sh\nOD_AI_KEY_HELPER="${keyHelper}" exec true\n`);
    chmodSync(keyHelper, 0o755);
    chmodSync(odAi, 0o755);

    const env = buildChildProcessEnv({ HOME: "/home/coder", PATH: binDir });

    expect(env.AI_GATEWAY_API_KEY).toBe("sk-homebrew");
  });

  it("preserves an existing gateway key", () => {
    const env = buildChildProcessEnv({
      HOME: "/home/coder",
      PATH: "/usr/bin",
      AI_GATEWAY_API_KEY: "sk-existing",
    });

    expect(env.AI_GATEWAY_API_KEY).toBe("sk-existing");
  });
});
