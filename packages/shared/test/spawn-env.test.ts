import { describe, expect, it } from "vitest";
import { buildChildProcessEnv } from "../src/adapters/spawn-env.js";

describe("buildChildProcessEnv", () => {
  it("drops oversized non-essential values", () => {
    const env = buildChildProcessEnv({
      HOME: "/home/coder",
      PATH: "/usr/bin",
      OPENAI_API_KEY: "sk-test",
      HUGE_PAYLOAD: "x".repeat(20 * 1024),
    });

    expect(env.HOME).toBe("/home/coder");
    expect(env.PATH).toBe("/usr/bin");
    expect(env.OPENAI_API_KEY).toBe("sk-test");
    expect(env.HUGE_PAYLOAD).toBeUndefined();
  });

  it("trims largest non-essential values until the environment is bounded", () => {
    const env = buildChildProcessEnv({
      HOME: "/home/coder",
      PATH: "/usr/bin",
      OPENAI_API_KEY: "sk-test",
      KEEP_ME: "short",
      LARGE_ONE: "a".repeat(15 * 1024),
      LARGE_TWO: "b".repeat(15 * 1024),
      LARGE_THREE: "c".repeat(15 * 1024),
      LARGE_FOUR: "d".repeat(15 * 1024),
      LARGE_FIVE: "e".repeat(15 * 1024),
    });

    expect(env.HOME).toBe("/home/coder");
    expect(env.PATH).toBe("/usr/bin");
    expect(env.OPENAI_API_KEY).toBe("sk-test");
    expect(env.KEEP_ME).toBe("short");
    expect(Object.keys(env).some((key) => key.startsWith("LARGE_"))).toBe(true);
    expect(Object.values(env).join("").length).toBeLessThan(64 * 1024);
  });

  it("keeps tool credentials even before dropping larger non-essential values", () => {
    const env = buildChildProcessEnv({
      HOME: "/home/coder",
      PATH: "/usr/bin",
      OPENAI_API_KEY: "sk-test",
      ANTHROPIC_API_KEY: "sk-ant-test",
      LARGE_ONE: "a".repeat(15 * 1024),
      LARGE_TWO: "b".repeat(15 * 1024),
      LARGE_THREE: "c".repeat(15 * 1024),
      LARGE_FOUR: "d".repeat(15 * 1024),
      LARGE_FIVE: "e".repeat(15 * 1024),
    });

    expect(env.OPENAI_API_KEY).toBe("sk-test");
    expect(env.ANTHROPIC_API_KEY).toBe("sk-ant-test");
  });

  it("keeps injected MCP token variables for Codex", () => {
    const env = buildChildProcessEnv({
      HOME: "/home/coder",
      PATH: "/usr/bin",
      TRACE_MCP_TOKEN_LINEAR_MCP: "mcp-token",
      LARGE_ONE: "a".repeat(15 * 1024),
      LARGE_TWO: "b".repeat(15 * 1024),
      LARGE_THREE: "c".repeat(15 * 1024),
      LARGE_FOUR: "d".repeat(15 * 1024),
      LARGE_FIVE: "e".repeat(15 * 1024),
    });

    expect(env.TRACE_MCP_TOKEN_LINEAR_MCP).toBe("mcp-token");
  });
});
