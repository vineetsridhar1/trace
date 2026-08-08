import { describe, expect, it } from "vitest";
import { guardedPlaywrightArgs } from "./playwright-cli-guard.js";

const env = {
  PLAYWRIGHT_CLI_CONFIG: "/opt/trace/playwright-cli.config.json",
  PLAYWRIGHT_CLI_SESSION: "trace-0123456789abcdef0123456789abcdef",
  TRACE_PLAYWRIGHT_CLI_RAW: "/raw/playwright-cli",
};

describe("guardedPlaywrightArgs", () => {
  it("pins every command to the invocation session", () => {
    expect(
      guardedPlaywrightArgs(
        ["--config=/opt/trace/playwright-cli.config.json", "open", "http://localhost:3000"],
        env,
      ),
    ).toEqual({
      rawExecutable: "/raw/playwright-cli",
      args: [
        "-s=trace-0123456789abcdef0123456789abcdef",
        "--config=/opt/trace/playwright-cli.config.json",
        "open",
        "http://localhost:3000",
      ],
    });
  });

  it.each(["list", "show", "close-all", "kill-all"])("blocks global command %s", (command) => {
    expect(() => guardedPlaywrightArgs([command], env)).toThrow("unavailable in Trace sessions");
  });

  it.each(["-s=other", "--session=other"])("blocks session override %s", (selector) => {
    expect(() => guardedPlaywrightArgs([selector, "open"], env)).toThrow(
      "session selection is managed by Trace",
    );
  });

  it("blocks a config outside the invocation policy", () => {
    expect(() => guardedPlaywrightArgs(["--config=/tmp/unsafe.json", "open"], env)).toThrow(
      "config selection is managed by Trace",
    );
  });
});
