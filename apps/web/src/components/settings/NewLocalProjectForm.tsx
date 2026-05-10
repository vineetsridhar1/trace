import { FolderOpen } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import type { ProjectParentSelection } from "./repo-dialog-types";

export function NewLocalProjectForm({
  projectName,
  parentSelection,
  autoFocus,
  onProjectNameChange,
  onPickParentFolder,
}: {
  projectName: string;
  parentSelection: ProjectParentSelection | null;
  autoFocus: boolean;
  onProjectNameChange: (name: string) => void;
  onPickParentFolder: () => void;
}) {
  return (
    <>
      <div>
        <label className="mb-1.5 block text-sm text-muted-foreground">Project name</label>
        <Input
          value={projectName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onProjectNameChange(e.target.value)
          }
          placeholder="e.g. mobile-app"
          autoFocus={autoFocus}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm text-muted-foreground">Location</label>
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={onPickParentFolder}
        >
          <FolderOpen size={16} />
          <span className="min-w-0 truncate">
            {parentSelection?.path ?? "Choose parent folder"}
          </span>
        </Button>
      </div>
    </>
  );
}
