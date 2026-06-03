import { useCallback } from "react";
import { RefreshCw, Terminal } from "lucide-react";
import { Button } from "../ui/button";
import { useGithubCliTokenConfiguration } from "./useGithubCliTokenConfiguration";

function isMissingGithubTokenError(error: string): boolean {
  return error.toLowerCase().includes("no github token configured");
}

export function FileLoadErrorPanel({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => Promise<void> | void;
}) {
  const missingGithubToken = isMissingGithubTokenError(error);
  const {
    canConfigureFromCli,
    checkingCli,
    configuring,
    configurationError,
    cliStatusError,
    showLoginInstructions,
    configureFromCli,
    refreshCliStatus,
  } = useGithubCliTokenConfiguration({
    enabled: missingGithubToken,
    onConfigured: onRetry,
  });

  const handleRetry = useCallback(async () => {
    await refreshCliStatus();
    await onRetry();
  }, [onRetry, refreshCliStatus]);

  return (
    <div className="flex h-full flex-col items-center justify-center bg-[#1e1e1e] px-6 py-8 text-center">
      <div className="flex w-full max-w-xl flex-col items-center gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-red-400">Failed to load file</p>
          <p className="break-words text-xs text-muted-foreground">{error}</p>
        </div>

        {checkingCli && missingGithubToken && (
          <p className="text-xs text-muted-foreground">Checking GitHub CLI status...</p>
        )}

        {showLoginInstructions && (
          <div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-surface-deep px-4 py-3 text-left">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">GitHub access is not configured</p>
              <p className="text-xs text-muted-foreground">
                Trace reads generated session files through the GitHub API. Add a GitHub token, then
                retry this file.
              </p>
            </div>
            <ol className="flex list-decimal flex-col gap-1 pl-4 text-xs text-muted-foreground">
              <li>
                Run <code className="font-mono text-foreground">gh auth login</code> if GitHub CLI
                is not logged in.
              </li>
              <li>Then retry, or paste a token in Settings, API Keys, GitHub.</li>
            </ol>
            {cliStatusError && (
              <p className="break-words font-mono text-xs text-muted-foreground">
                {cliStatusError}
              </p>
            )}
            {configurationError && (
              <p className="break-words text-xs text-destructive">{configurationError}</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2">
          {canConfigureFromCli && (
            <Button
              type="button"
              size="sm"
              disabled={configuring}
              onClick={() => void configureFromCli()}
            >
              <Terminal data-icon="inline-start" />
              {configuring ? "Configuring..." : "Use GitHub CLI token"}
            </Button>
          )}
          {!canConfigureFromCli && (
            <Button type="button" variant="ghost" size="sm" onClick={() => void handleRetry()}>
              <RefreshCw data-icon="inline-start" />
              Retry
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
