import { toast } from "sonner";
import { getCodingToolCli, type CodingToolCli } from "@trace/shared";

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

function ToolNotInstalledDescription({
  cli,
  where,
}: {
  cli: CodingToolCli | undefined;
  where: string;
}) {
  if (!cli) {
    return <span>It isn't installed on {where}.</span>;
  }
  return (
    <div className="flex flex-col gap-2">
      <span>
        It isn't installed on {where}. Install it with:
      </span>
      <code className="block rounded bg-black/30 px-2 py-1 font-mono text-[11px] break-all">
        {cli.install}
      </code>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void navigator.clipboard?.writeText(cli.install)}
          className="rounded-md bg-white/10 px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-white/20"
        >
          Copy install command
        </button>
        <a
          href={cli.installUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Docs
        </a>
      </div>
    </div>
  );
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

  toast.error(`${label} isn't installed`, {
    id: `tool-not-installed-${info.tool}`,
    description: <ToolNotInstalledDescription cli={cli} where={where} />,
    duration: Infinity,
    closeButton: true,
  });
  return true;
}
