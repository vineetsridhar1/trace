import type { RepoApplicationConfig } from "@trace/gql";
import { Button } from "../../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { Textarea } from "../../ui/textarea";
import { SessionAutomationRunScripts } from "./SessionAutomationRunScripts";
import { useSessionAutomationDraft } from "./useSessionAutomationDraft";

export function ApplicationConfigDialog({
  open,
  repoName,
  config,
  saving,
  error,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  repoName: string;
  config: RepoApplicationConfig | undefined;
  saving: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (config: RepoApplicationConfig) => Promise<void>;
}) {
  const draft = useSessionAutomationDraft({
    open,
    config,
    error,
    onOpenChange,
    onSave,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-black/60 backdrop-blur-[2px]"
        className="max-h-[calc(100dvh-3rem)] gap-0 overflow-hidden p-0 sm:max-w-[620px]"
      >
        <DialogHeader className="shrink-0 gap-0.5 border-b border-border px-6 py-4 pr-14 text-left">
          <DialogTitle className="text-[15px] font-semibold tracking-[-0.01em]">
            Edit session automation
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-5">
            <span className="font-medium text-foreground">{repoName}</span> · shared by every coding
            channel on this repository.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Setup script
            </span>
            <Textarea
              rows={4}
              value={draft.setupScript}
              onChange={(event) => draft.updateSetupScript(event.target.value)}
              placeholder="e.g. npm install && npm run build"
              className="min-h-24 resize-none bg-background font-mono text-xs leading-5"
            />
            <span className="mt-1.5 block text-xs leading-4 text-muted-foreground">
              Runs once from the repository root when a session workspace starts. Terminals stay
              blocked until it finishes.
            </span>
          </label>

          <SessionAutomationRunScripts
            scripts={draft.runScripts}
            focusedProcessId={draft.focusedProcessId}
            onAdd={draft.addRunScript}
            onRemove={draft.removeRunScript}
            onUpdate={draft.updateRunScript}
          />
        </div>

        {draft.formError ? (
          <p className="border-t border-border px-6 py-2 text-xs text-destructive">
            {draft.formError}
          </p>
        ) : null}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-background px-6 py-3.5">
          <span className="flex items-center gap-1.5 text-xs text-amber-400">
            {draft.dirty ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                Unsaved changes
              </>
            ) : null}
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!draft.dirty || saving}
              onClick={() => void draft.save()}
            >
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
