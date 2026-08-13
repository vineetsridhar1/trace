import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { Button } from "../ui/button";

interface RepoDesktopSectionProps {
  repoId: string;
  desktopRefreshKey?: number;
}

export function RepoDesktopSection({ repoId, desktopRefreshKey }: RepoDesktopSectionProps) {
  const [desktopRepoConfig, setDesktopRepoConfig] = useState<DesktopRepoConfig | null>(null);
  const [linking, setLinking] = useState(false);

  const refreshDesktopState = async () => {
    if (!window.trace?.getRepoConfig) return;

    const repoConfig = await window.trace.getRepoConfig(repoId);
    setDesktopRepoConfig(repoConfig);

  };

  useEffect(() => {
    refreshDesktopState().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Failed to refresh desktop repository state:", message);
    });
  }, [repoId, desktopRefreshKey]);

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
    } finally {
      setLinking(false);
    }
  };

  const linkedPath = desktopRepoConfig?.path ?? null;

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

    </div>
  );
}
