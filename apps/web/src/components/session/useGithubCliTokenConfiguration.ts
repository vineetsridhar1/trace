import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export function useGithubCliTokenConfiguration({
  enabled,
  onConfigured,
}: {
  enabled: boolean;
  onConfigured: () => Promise<void> | void;
}) {
  const [githubCliStatus, setGithubCliStatus] = useState<DesktopGithubCliStatus | null>(null);
  const [cliStatusChecked, setCliStatusChecked] = useState(false);
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
      setCliStatusChecked(enabled);
      return;
    }

    setCliStatusChecked(false);
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
      setCliStatusChecked(true);
    }
  }, [enabled]);

  useEffect(() => {
    let cancelled = false;
    const traceBridge = window.trace;
    setConfigurationError(null);

    if (!enabled || typeof traceBridge?.getGithubCliStatus !== "function") {
      setGithubCliStatus(null);
      setCheckingCli(false);
      setCliStatusChecked(enabled);
      return;
    }

    setCliStatusChecked(false);
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
        if (!cancelled) {
          setCheckingCli(false);
          setCliStatusChecked(true);
        }
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
    checkingCli,
    configuring,
    configurationError,
    showLoginInstructions: enabled && cliStatusChecked && !checkingCli && !canConfigureFromCli,
    cliStatusError:
      githubCliStatus && !githubCliStatus.authenticated ? githubCliStatus.error : null,
    configureFromCli,
    refreshCliStatus,
  };
}
