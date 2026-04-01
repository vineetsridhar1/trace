import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { Button } from "../ui/button";
import {
  getHookStatusTone,
  getHookStatusLabel,
  getHookStatusDetail,
} from "./repo-hook-utils";

interface RepoDesktopSectionProps {
  repoId: string;
  desktopRefreshKey?: number;
}

export function RepoDesktopSection({ repoId, desktopRefreshKey }: RepoDesktopSectionProps) {
  const [desktopRepoConfig, setDesktopRepoConfig] = useState<DesktopRepoConfig | null>(null);
  const [gitHookStatus, setGitHookStatus] = useState<DesktopRepoGitHookStatus | null>(null);
  const [gitHookPending, setGitHookPending] = useState(false);
  const [gitHookError, setGitHookError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  const refreshDesktopState = async () => {
    if (!window.trace?.getRepoConfig) return;

    const repoConfig = await window.trace.getRepoConfig(repoId);
    setDesktopRepoConfig(repoConfig);

    if (!repoConfig) {
      setGitHookStatus(null);
      return;
    }

    const status = await window.trace.getRepoGitHookStatus(repoId);
    setGitHookStatus(status);
  };

  useEffect(() => {
    refreshDesktopState().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      setGitHookError(message);
    });
  }, [repoId, desktopRefreshKey]);

  const linkToLocalPath = async () => {
    if (!window.trace?.pickFolder || !window.trace?.saveRepoPath || linking) return;

    setLinking(true);
    setGitHookError(null);

    try {
      const folderPath = await window.trace.pickFolder();
      if (!folderPath) return;

      await window.trace.saveRepoPath(repoId, folderPath);
      await refreshDesktopState();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGitHookError(message);
    } finally {
      setLinking(false);
    }
  };

  const toggleGitHooks = async () => {
    if (!window.trace?.setRepoGitHooksEnabled || !desktopRepoConfig || gitHookPending) return;

    setGitHookPending(true);
    setGitHookError(null);

    try {
      const next = await window.trace.setRepoGitHooksEnabled(
        repoId,
        !desktopRepoConfig.gitHooksEnabled,
      );
      setDesktopRepoConfig(next.config);
      setGitHookStatus(next.status);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGitHookError(message);
    } finally {
      setGitHookPending(false);
    }
  };

  const repairGitHooks = async () => {
    if (!window.trace?.repairRepoGitHooks || gitHookPending) return;

    setGitHookPending(true);
    setGitHookError(null);

    try {
      const nextStatus = await window.trace.repairRepoGitHooks(repoId);
      setGitHookStatus(nextStatus);
      await refreshDesktopState();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGitHookError(message);
    } finally {
      setGitHookPending(false);
    }
  };

  const linkedPath = desktopRepoConfig?.path ?? null;
  const gitHooksEnabled = desktopRepoConfig?.gitHooksEnabled ?? false;
  const hookStatusLabel = getHookStatusLabel(linkedPath, gitHooksEnabled, gitHookStatus);
  const hookStatusDetail = getHookStatusDetail(gitHooksEnabled, gitHookStatus);
  const hookStatusTone = getHookStatusTone(linkedPath, gitHooksEnabled, gitHookStatus);
  const showRepairButton =
    !!linkedPath &&
    gitHooksEnabled &&
    !!gitHookStatus &&
    (gitHookStatus.state === "error" || gitHookStatus.state === "not_installed");

  return (
    <div className="mt-3 rounded-md border border-border/70 bg-surface-elevated/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground">Desktop Linking</p>
          {linkedPath ? (
            <p className="mt-0.5 truncate text-xs text-emerald-500">{linkedPath}</p>
          ) : (
            <p className="mt-0.5 text-xs text-amber-500">Not linked on this computer</p>
          )}
        </div>
        {!linkedPath && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={linkToLocalPath}
            disabled={linking}
          >
            <FolderOpen size={12} />
            {linking ? "Linking..." : "Link Local Path"}
          </Button>
        )}
      </div>

      {linkedPath && (
        <>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground">Git Hooks</p>
            </div>
            <Button
              variant={gitHooksEnabled ? "secondary" : "outline"}
              size="sm"
              onClick={toggleGitHooks}
              disabled={gitHookPending}
            >
              {gitHookPending
                ? gitHooksEnabled
                  ? "Disabling..."
                  : "Enabling..."
                : gitHooksEnabled
                  ? "Disable Hooks"
                  : "Enable Hooks"}
            </Button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className={`text-xs ${hookStatusTone}`}>{hookStatusLabel}</p>
            {showRepairButton && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={repairGitHooks}
                disabled={gitHookPending}
              >
                Repair Hooks
              </Button>
            )}
          </div>

          {hookStatusDetail && (
            <p className="mt-2 text-xs text-muted-foreground">{hookStatusDetail}</p>
          )}
        </>
      )}

      {gitHookError && <p className="mt-2 text-xs text-destructive">{gitHookError}</p>}
    </div>
  );
}
