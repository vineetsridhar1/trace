import { toast } from "sonner";
import { type ActionRequiredArtifact } from "@trace/shared";
import { ActionRequiredArtifactCard } from "../components/session/messages/ActionRequiredArtifactCard";

interface ToolNotInstalledInfo {
  tool: string;
  runtimeLabel: string | null;
}

/**
 * Detect the server's TOOL_NOT_INSTALLED GraphQL error (raised when a session's
 * coding tool isn't installed on its runtime). urql surfaces server errors on
 * `graphQLErrors`, each carrying the `extensions` set in toGraphQLError.
 */
function extractToolNotInstalled(error: unknown): ToolNotInstalledInfo | null {
  const graphQLErrors = (error as { graphQLErrors?: unknown }).graphQLErrors;
  if (!Array.isArray(graphQLErrors)) return null;
  for (const gqlError of graphQLErrors) {
    const extensions = (gqlError as { extensions?: Record<string, unknown> }).extensions;
    if (extensions?.code !== "TOOL_NOT_INSTALLED") continue;
    return {
      tool: typeof extensions.tool === "string" ? extensions.tool : "",
      runtimeLabel: typeof extensions.runtimeLabel === "string" ? extensions.runtimeLabel : null,
    };
  }
  return null;
}

/**
 * If `error` is a TOOL_NOT_INSTALLED error, show a persistent (non-auto-closing)
 * toast with install instructions and return true. Otherwise return false so the
 * caller can fall back to its generic error handling.
 */
export function showToolNotInstalledToast(error: unknown): boolean {
  const info = extractToolNotInstalled(error);
  if (!info) return false;

  const artifact: ActionRequiredArtifact = {
    kind: "tool_not_installed",
    tool: info.tool,
    runtimeLabel: info.runtimeLabel,
    title: "Install the selected coding tool",
    description: `The selected coding tool is not installed on ${info.runtimeLabel ?? "this runtime"}.`,
  };

  toast.error(artifact.title, {
    id: `tool-not-installed-${info.tool}`,
    description: <ActionRequiredArtifactCard artifact={artifact} />,
    duration: Infinity,
    closeButton: true,
  });
  return true;
}
