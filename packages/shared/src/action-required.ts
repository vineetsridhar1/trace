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

export function actionRequiredArtifactKey(artifact: ActionRequiredArtifact): string {
  switch (artifact.kind) {
    case "credential_required":
      return `${artifact.kind}:${artifact.provider}`;
    case "tool_not_installed":
      return `${artifact.kind}:${artifact.tool}`;
    case "login_required":
      return `${artifact.kind}:${artifact.provider}`;
  }
}

/** Recognize stable, documented CLI recovery prompts without exposing raw stderr as UI. */
export function actionRequiredArtifactForToolError(
  tool: string | undefined,
  message: string,
): ActionRequiredArtifact | undefined {
  if (/could not read Username.*github\.com|github\.com.*terminal prompts disabled/i.test(message)) {
    return {
      kind: "login_required",
      provider: "github",
      title: "Sign in to GitHub",
      description: "This workspace needs GitHub credentials to continue.",
    };
  }

  if (
    tool === "codex" &&
    /not logged in|login required|run\s+(?:`?codex`?\s+)?login|authentication required|unauthorized|\b401\b|invalid api[ _-]?key|no api[ _-]?key|openai_api_key.*(?:not set|missing)/i.test(
      message,
    )
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

/** Extract a provider failure from a normalized tool output without trusting the UI state. */
export function actionRequiredArtifactForToolOutput(
  tool: string | undefined,
  output: unknown,
): ActionRequiredArtifact | undefined {
  if (!output || typeof output !== "object" || Array.isArray(output)) return undefined;
  const data = output as Record<string, unknown>;
  if (data.type === "error" && typeof data.message === "string") {
    return actionRequiredArtifactForToolError(tool, data.message);
  }
  if (data.type !== "assistant" || !data.message || typeof data.message !== "object") {
    return undefined;
  }
  const content = (data.message as Record<string, unknown>).content;
  if (!Array.isArray(content)) return undefined;
  const message = content
    .map((block) => {
      if (!block || typeof block !== "object" || Array.isArray(block)) return "";
      const value = block as Record<string, unknown>;
      return value.type === "text" && typeof value.text === "string" ? value.text : "";
    })
    .join("\n")
    .trim();
  return message ? actionRequiredArtifactForToolError(tool, message) : undefined;
}
