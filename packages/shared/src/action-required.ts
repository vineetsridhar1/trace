/** A safe, declarative recovery card rendered from a durable session event. */
export type ActionRequiredArtifact =
  | {
      kind: "credential_required";
      provider: "anthropic" | "openai";
      title: string;
      description: string;
    }
  | {
      kind: "tool_not_installed";
      tool: string;
      runtimeLabel: string | null;
      title: string;
      description: string;
    }
  | {
      kind: "login_required";
      provider: "codex" | "claude_code" | "github" | "pi";
      title: string;
      description: string;
    };

export function isActionRequiredArtifact(value: unknown): value is ActionRequiredArtifact {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const artifact = value as Record<string, unknown>;
  if (typeof artifact.title !== "string" || typeof artifact.description !== "string") return false;
  if (artifact.kind === "credential_required") {
    return artifact.provider === "anthropic" || artifact.provider === "openai";
  }
  if (artifact.kind === "tool_not_installed") {
    return typeof artifact.tool === "string" && (typeof artifact.runtimeLabel === "string" || artifact.runtimeLabel === null);
  }
  return (
    artifact.kind === "login_required" &&
    (artifact.provider === "codex" ||
      artifact.provider === "claude_code" ||
      artifact.provider === "github" ||
      artifact.provider === "pi")
  );
}

/** Recognize stable, documented CLI recovery prompts without exposing raw stderr as UI. */
export function actionRequiredArtifactForToolError(
  tool: string | undefined,
  message: string,
): ActionRequiredArtifact | undefined {
  if (/could not read Username|authentication failed|terminal prompts disabled/i.test(message)) {
    return {
      kind: "login_required",
      provider: "github",
      title: "Sign in to GitHub",
      description: "This workspace needs GitHub credentials to continue.",
    };
  }

  if (
    tool === "codex" &&
    /not logged in|login required|run codex login|authentication required/i.test(message)
  ) {
    return {
      kind: "login_required",
      provider: "codex",
      title: "Sign in to Codex",
      description: "This local runtime needs a Codex login to continue.",
    };
  }

  if (
    tool === "claude_code" &&
    /not logged in|login required|run claude login|authentication required/i.test(message)
  ) {
    return {
      kind: "login_required",
      provider: "claude_code",
      title: "Sign in to Claude Code",
      description: "This local runtime needs a Claude Code login to continue.",
    };
  }

  if (tool === "pi" && /not logged in|please run \/login|login required/i.test(message)) {
    return {
      kind: "login_required",
      provider: "pi",
      title: "Sign in to Pi",
      description: "This local runtime needs a Pi login to continue.",
    };
  }

  return undefined;
}
