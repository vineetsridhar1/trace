import { FolderOpen } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { RepoPreview } from "./RepoPreview";
import type { DetectedRepo } from "./repo-dialog-types";

export function ExistingRepoForm({
  detected,
  defaultBranch,
  onPickFolder,
  onDefaultBranchChange,
}: {
  detected: DetectedRepo | null;
  defaultBranch: string;
  onPickFolder: () => void;
  onDefaultBranchChange: (branch: string) => void;
}) {
  return (
    <>
      <Button variant="outline" className="w-full gap-2" onClick={onPickFolder}>
        <FolderOpen size={16} />
        Choose Folder
      </Button>

      {detected && (
        <>
          <RepoPreview repo={detected} />
          <div>
            <label className="mb-1.5 block text-sm text-muted-foreground">Default branch</label>
            <Input
              value={defaultBranch}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onDefaultBranchChange(e.target.value)
              }
              placeholder={detected.defaultBranch}
            />
          </div>
        </>
      )}
    </>
  );
}
