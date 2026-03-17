import { useState } from "react";
import { AlertTriangle, FolderOpen } from "lucide-react";
import { useEntityField } from "../../stores/entity";
import { Button } from "../ui/button";

interface RepoNotLinkedWarningProps {
  repoId: string;
  onLinked: () => void;
}

export function RepoNotLinkedWarning({ repoId, onLinked }: RepoNotLinkedWarningProps) {
  const name = useEntityField("repos", repoId, "name");
  const remoteUrl = useEntityField("repos", repoId, "remoteUrl");
  const isElectron = typeof window.trace?.pickFolder === "function";
  const [error, setError] = useState<string | null>(null);

  const handleLink = async () => {
    if (!window.trace?.pickFolder || !window.trace?.saveRepoPath || !window.trace?.getGitInfo) return;
    setError(null);
    const folderPath = await window.trace.pickFolder();
    if (!folderPath) return;

    // Validate the folder is a git repo with matching remote
    const gitInfo = await window.trace.getGitInfo(folderPath);
    if ("error" in gitInfo) {
      setError(gitInfo.error as string);
      return;
    }
    if (remoteUrl && gitInfo.remoteUrl !== remoteUrl) {
      setError(`Remote URL mismatch: expected ${remoteUrl}, got ${gitInfo.remoteUrl}`);
      return;
    }

    await window.trace.saveRepoPath(repoId, folderPath);
    onLinked();
  };

  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-amber-600 dark:text-amber-200">
          <span className="font-medium">{name}</span> is not linked on this device.
        </p>
        {error && (
          <p className="mt-1 text-xs text-destructive">{error}</p>
        )}
        {isElectron && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 gap-1.5"
            onClick={handleLink}
          >
            <FolderOpen size={12} />
            Choose folder to link
          </Button>
        )}
      </div>
    </div>
  );
}
