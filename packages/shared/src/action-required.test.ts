import { describe, expect, it } from "vitest";
import {
  actionRequiredArtifactForToolError,
  actionRequiredArtifactForToolOutput,
} from "./action-required.js";

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
    expect(
      actionRequiredArtifactForToolError("codex", "401 Unauthorized: invalid API key"),
    ).toMatchObject({ kind: "login_required", provider: "codex" });
    expect(
      actionRequiredArtifactForToolError("claude_code", "Not logged in · Please run /login"),
    ).toMatchObject({ kind: "login_required", provider: "claude_code" });
    expect(
      actionRequiredArtifactForToolError("pi", "Not logged in · Please run /login"),
    ).toMatchObject({
      kind: "login_required",
      provider: "pi",
    });
  });

  it("leaves unknown errors unclassified", () => {
    expect(actionRequiredArtifactForToolError("codex", "unexpected process exit")).toBeUndefined();
    expect(actionRequiredArtifactForToolError("codex", "authentication failed")).toBeUndefined();
  });

  it("does not classify assistant instructions as tool failures", () => {
    expect(
      actionRequiredArtifactForToolOutput("codex", {
        type: "assistant",
        message: {
          content: [
            {
              type: "text",
              text: "Ensure Codex is ready:\n\n```bash\ncodex login\n```",
            },
          ],
        },
      }),
    ).toBeUndefined();
  });

  it("classifies Codex's Responses API authentication failure", () => {
    expect(
      actionRequiredArtifactForToolOutput("codex", {
        type: "error",
        message:
          "Reconnecting... unexpected status 401 Unauthorized: Missing bearer or basic authentication in header",
      }),
    ).toMatchObject({ kind: "login_required", provider: "codex" });
  });
});
