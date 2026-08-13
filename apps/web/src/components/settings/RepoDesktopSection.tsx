import { useCallback, useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";

interface RepoDesktopSectionProps {
  repoId: string;
  desktopRefreshKey?: number;
}

export function RepoDesktopSection({ repoId, desktopRefreshKey }: RepoDesktopSectionProps) {
  const [desktopRepoConfig, setDesktopRepoConfig] = useState<DesktopRepoConfig | null>(null);
  const [desktopStateLoaded, setDesktopStateLoaded] = useState(false);
  const [desktopError, setDesktopError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  const refreshDesktopState = useCallback(async () => {
    if (!window.trace?.getRepoConfig) return;

    const repoConfig = await window.trace.getRepoConfig(repoId);
    setDesktopRepoConfig(repoConfig);
    setDesktopError(null);
    setDesktopStateLoaded(true);
  }, [repoId]);

  useEffect(() => {
    refreshDesktopState().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to refresh desktop repository state:", message);
      setDesktopError(message);
      setDesktopStateLoaded(true);
    });
  }, [desktopRefreshKey, refreshDesktopState]);

  const linkToLocalPath = async () => {
    if (!window.trace?.pickFolder || !window.trace?.saveRepoPath || linking) return;

    setLinking(true);

    try {
      const folderPath = await window.trace.pickFolder();
      if (!folderPath) return;

      await window.trace.saveRepoPath(repoId, folderPath);
      await refreshDesktopState();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to link desktop repository:", message);
      setDesktopError(message);
    } finally {
      setLinking(false);
    }
  };

  const linkedPath = desktopRepoConfig?.path ?? null;
  if (!desktopStateLoaded) return null;

  return (
    <>
      <span aria-hidden="true" className="shrink-0 text-muted-foreground/60">
        ·
      </span>
      {desktopError ? (
        <button
          type="button"
          className="shrink-0 text-amber-500 hover:text-amber-400"
          title={desktopError}
          onClick={() => void refreshDesktopState()}
        >
          Local path unavailable · Retry
        </button>
      ) : linkedPath ? (
        <span className="truncate" title={linkedPath}>
          {linkedPath}
        </span>
      ) : (
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 text-amber-500 hover:text-amber-400 disabled:cursor-wait disabled:opacity-60"
          onClick={linkToLocalPath}
          disabled={linking}
        >
          <FolderOpen size={11} />
          {linking ? "Linking..." : "Link local path"}
        </button>
      )}
    </>
  );
}
