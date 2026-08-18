import { describe, expect, it } from "vitest";
import { CODING_TOOL_CLIS } from "@trace/shared";
import { getInstallCommand, getPackageManager } from "./coding-tools.js";

describe("Codex package manager detection", () => {
  it("detects the Homebrew cask from its resolved executable", () => {
    expect(
      getPackageManager("codex", "/opt/homebrew/bin/codex", () =>
        "/opt/homebrew/Caskroom/codex/0.147.0/bin/codex",
      ),
    ).toEqual({ kind: "homebrew", packageName: "codex", cask: true });
  });

  it("upgrades a Homebrew-installed Codex with brew", () => {
    expect(
      getInstallCommand(
        CODING_TOOL_CLIS.codex,
        { kind: "homebrew", packageName: "codex", cask: true },
        null,
      ),
    ).toEqual({ executable: "brew", args: ["upgrade", "--cask", "codex"] });
  });

  it("keeps npm updates scoped to the npm installation that owns Codex", () => {
    expect(
      getInstallCommand(
        CODING_TOOL_CLIS.codex,
        { kind: "npm", packageName: "@openai/codex" },
        "/Users/example/.nvm/versions/node/v22.0.0",
      ),
    ).toEqual({
      executable: "npm",
      args: [
        "--prefix",
        "/Users/example/.nvm/versions/node/v22.0.0",
        "install",
        "--global",
        "@openai/codex@latest",
      ],
    });
  });
});
