import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

const testHome = vi.hoisted(
  () => `${process.env.TMPDIR ?? "/tmp"}/trace-config-test-${Date.now()}-${Math.random()}`,
);

vi.mock("electron", () => ({
  app: {
    getPath: (name: string) => {
      if (name === "home") return testHome;
      return join(testHome, name);
    },
  },
}));

import { getCodingToolExecutableOverrides, setCodingToolExecutableOverride } from "./config.js";

afterAll(() => {
  rmSync(testHome, { force: true, recursive: true });
});

describe("coding tool executable overrides", () => {
  it("persists and clears an executable path", async () => {
    await setCodingToolExecutableOverride("claude_code", "/custom/claude");
    expect(getCodingToolExecutableOverrides()).toEqual({ claude_code: "/custom/claude" });

    await setCodingToolExecutableOverride("claude_code", null);
    expect(getCodingToolExecutableOverrides()).toEqual({});
  });
});
