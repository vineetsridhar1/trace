import { FolderOpen } from "lucide-react";
import { Button } from "../ui/button";
import { RepoPreview } from "./RepoPreview";
import type { DetectedRepo } from "./repo-dialog-types";

export function ExistingRepoForm({
  detected,
  onPickFolder,
}: {
  detected: DetectedRepo | null;
  onPickFolder: () => void;
}) {
  return (
    <>
      <Button variant="outline" className="w-full gap-2" onClick={onPickFolder}>
        <FolderOpen size={16} />
        Choose Folder
      </Button>

      {detected && <RepoPreview repo={detected} />}
    </>
  );
}
