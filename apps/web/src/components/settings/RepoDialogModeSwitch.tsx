import { Button } from "../ui/button";
import type { RepoDialogMode } from "./repo-dialog-types";

export function RepoDialogModeSwitch({
  mode,
  onModeChange,
}: {
  mode: RepoDialogMode;
  onModeChange: (mode: RepoDialogMode) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-surface-deep p-1">
      <Button
        type="button"
        variant={mode === "link" ? "secondary" : "ghost"}
        size="sm"
        onClick={() => onModeChange("link")}
      >
        Existing
      </Button>
      <Button
        type="button"
        variant={mode === "create" ? "secondary" : "ghost"}
        size="sm"
        onClick={() => onModeChange("create")}
      >
        New Project
      </Button>
    </div>
  );
}
