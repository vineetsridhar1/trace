import { describe, expect, it } from "vitest";
import { actionRequiredArtifactForToolError } from "./action-required.js";

describe("actionRequiredArtifactForToolError", () => {
  it("recognizes GitHub credentials errors before tool-specific login errors", () => {
    expect(
      actionRequiredArtifactForToolError(
        "codex",
        "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
      ),
    ).toMatchObject({ kind: "login_required", provider: "github" });
  });

  it("recognizes local Codex, Claude Code, and Pi login errors", () => {
    expect(
      actionRequiredArtifactForToolError("codex", "Not logged in. Run codex login."),
    ).toMatchObject({ kind: "login_required", provider: "codex" });
    expect(actionRequiredArtifactForToolError("claude_code", "Login required")).toMatchObject({
      kind: "login_required",
      provider: "claude_code",
    });
    expect(actionRequiredArtifactForToolError("pi", "Not logged in · Please run /login")).toMatchObject({
      kind: "login_required",
      provider: "pi",
    });
  });

  it("leaves unknown errors unclassified", () => {
    expect(actionRequiredArtifactForToolError("codex", "unexpected process exit")).toBeUndefined();
  });
});
