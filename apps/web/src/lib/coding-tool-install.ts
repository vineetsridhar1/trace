import { toast } from "sonner";
import { getCodingToolCli } from "@trace/shared";

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

  const cli = getCodingToolCli(info.tool);
  const label = cli?.label ?? "This coding tool";
  const where = info.runtimeLabel ?? "this computer";
  const description = cli
    ? `It isn't installed on ${where}. Install it with:\n\n${cli.install}\n\nDocs: ${cli.installUrl}`
    : `It isn't installed on ${where}.`;

  toast.error(`${label} isn't installed`, {
    id: `tool-not-installed-${info.tool}`,
    description,
    duration: Infinity,
    closeButton: true,
    ...(cli
      ? {
          action: {
            label: "Copy install command",
            onClick: () => {
              void navigator.clipboard?.writeText(cli.install);
            },
          },
        }
      : {}),
  });
  return true;
}
