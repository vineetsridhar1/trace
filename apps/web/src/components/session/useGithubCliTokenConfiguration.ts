import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

function getCliStatusDetail({
  canImportFromCli,
  canCheckCliStatus,
  checkingCli,
  status,
}: {
  canImportFromCli: boolean;
  canCheckCliStatus: boolean;
  checkingCli: boolean;
  status: DesktopGithubCliStatus | null;
}): string | null {
  if (!canCheckCliStatus) {
    return "Automatic CLI import is available in Trace Desktop. In a browser, paste a token in Settings.";
  }
  if (checkingCli || !status) return "Checking GitHub CLI status on this machine...";
  if (!status.installed) return "Install GitHub CLI, then run gh auth login.";
  if (!status.authenticated) return "Run gh auth login on this machine, then retry.";
  if (!canImportFromCli) return "Restart Trace to load GitHub CLI token import.";
  return "GitHub CLI is logged in, so Trace can import that token automatically.";
}

export function useGithubCliTokenConfiguration({
  enabled,
  onConfigured,
}: {
  enabled: boolean;
  onConfigured: () => Promise<void> | void;
}) {
  const [githubCliStatus, setGithubCliStatus] = useState<DesktopGithubCliStatus | null>(null);
  const [checkingCli, setCheckingCli] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [configurationError, setConfigurationError] = useState<string | null>(null);
  const canCheckCliStatus = typeof window.trace?.getGithubCliStatus === "function";
  const canImportFromCli = typeof window.trace?.configureGithubTokenFromCli === "function";
  const canConfigureFromCli =
    enabled &&
    githubCliStatus?.installed === true &&
    githubCliStatus.authenticated === true &&
    canImportFromCli;

  const refreshCliStatus = useCallback(async () => {
    const traceBridge = window.trace;
    if (!enabled || typeof traceBridge?.getGithubCliStatus !== "function") {
      setGithubCliStatus(null);
      setCheckingCli(false);
      return;
    }

    setCheckingCli(true);
    try {
      const status = await traceBridge.getGithubCliStatus();
      setGithubCliStatus(status);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setGithubCliStatus({
        installed: false,
        authenticated: false,
        error: message,
      });
    } finally {
      setCheckingCli(false);
    }
  }, [enabled]);

  useEffect(() => {
    let cancelled = false;
    const traceBridge = window.trace;
    setConfigurationError(null);

    if (!enabled || typeof traceBridge?.getGithubCliStatus !== "function") {
      setGithubCliStatus(null);
      setCheckingCli(false);
      return;
    }

    setCheckingCli(true);
    traceBridge
      .getGithubCliStatus()
      .then((status) => {
        if (cancelled) return;
        setGithubCliStatus(status);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setGithubCliStatus({
          installed: false,
          authenticated: false,
          error: message,
        });
      })
      .finally(() => {
        if (!cancelled) setCheckingCli(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canCheckCliStatus, enabled]);

  const configureFromCli = useCallback(async () => {
    const traceBridge = window.trace;
    if (!canConfigureFromCli || configuring || !traceBridge?.configureGithubTokenFromCli) return;

    setConfiguring(true);
    setConfigurationError(null);
    try {
      const result = await traceBridge.configureGithubTokenFromCli();
      if (!result.ok) throw new Error(result.error);
      toast.success("GitHub token configured from GitHub CLI");
      await onConfigured();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setConfigurationError(message);
      toast.error("Could not configure GitHub token", { description: message });
    } finally {
      setConfiguring(false);
    }
  }, [canConfigureFromCli, configuring, onConfigured]);

  return {
    canConfigureFromCli,
    configuring,
    configurationError,
    cliStatusDetail: enabled
      ? getCliStatusDetail({
          canImportFromCli,
          canCheckCliStatus,
          checkingCli,
          status: githubCliStatus,
        })
      : null,
    cliStatusError:
      githubCliStatus && !githubCliStatus.authenticated ? githubCliStatus.error : null,
    configureFromCli,
    refreshCliStatus,
  };
}
