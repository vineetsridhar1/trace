import { describe, expect, it } from "vitest";
import { buildChildProcessEnv } from "../src/adapters/spawn-env.js";

describe("buildChildProcessEnv", () => {
  it("drops variables that were not explicitly exposed to the agent", () => {
    const env = buildChildProcessEnv({
      HOME: "/home/coder",
      PATH: "/usr/bin",
      OPENAI_API_KEY: "sk-test",
      HUGE_PAYLOAD: "x".repeat(20 * 1024),
      DATABASE_URL: "postgres://server-secret",
      TRACE_RUNTIME_TOKEN: "bridge-control-token",
    });

    expect(env.HOME).toBe("/home/coder");
    // PATH is augmented with common install dirs so spawned CLIs resolve even
    // when the launching process has a narrower PATH than the user's shell.
    expect(env.PATH?.split(":")).toContain("/usr/bin");
    expect(env.PATH?.split(":")).toContain("/home/coder/.local/bin");
    expect(env.OPENAI_API_KEY).toBe("sk-test");
    expect(env.HUGE_PAYLOAD).toBeUndefined();
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.TRACE_RUNTIME_TOKEN).toBeUndefined();
  });

  it("includes runtime-configured variables named by TRACE_AGENT_ENV_KEYS", () => {
    const env = buildChildProcessEnv({
      HOME: "/home/coder",
      PATH: "/usr/bin",
      TRACE_AGENT_ENV_KEYS: JSON.stringify(["DATABASE_URL", "CUSTOM_SETTING"]),
      DATABASE_URL: "postgres://agent-db",
      CUSTOM_SETTING: "enabled",
      SERVER_ONLY_SECRET: "hidden",
    });

    expect(env.DATABASE_URL).toBe("postgres://agent-db");
    expect(env.CUSTOM_SETTING).toBe("enabled");
    expect(env.SERVER_ONLY_SECRET).toBeUndefined();
    expect(env.TRACE_AGENT_ENV_KEYS).toBeUndefined();
  });

  it("keeps tool credentials and invocation-scoped capabilities", () => {
    const env = buildChildProcessEnv(
      {
        HOME: "/home/coder",
        PATH: "/usr/bin",
        OPENAI_API_KEY: "sk-test",
        ANTHROPIC_API_KEY: "sk-ant-test",
        TRACE_RUNTIME_TOKEN: "bridge-token",
      },
      {
        TRACE_INVOCATION_TOKEN: "invocation-token",
        TRACE_API_URL: "https://trace.example",
      },
    );

    expect(env.OPENAI_API_KEY).toBe("sk-test");
    expect(env.ANTHROPIC_API_KEY).toBe("sk-ant-test");
    expect(env.TRACE_INVOCATION_TOKEN).toBe("invocation-token");
    expect(env.TRACE_API_URL).toBe("https://trace.example");
    expect(env.TRACE_RUNTIME_TOKEN).toBeUndefined();
  });
});
