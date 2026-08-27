import { useEffect, useState } from "react";
import { GitCommitHorizontal, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Textarea } from "../ui/textarea";

export function SessionMoveChangesDialog({
  open,
  pending,
  onClose,
  onResolve,
}: {
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onResolve: (input: { strategy: "COMMIT" | "DISCARD"; commitMessage?: string }) => Promise<void>;
}) {
  const [commitMessage, setCommitMessage] = useState("Save session changes before moving");
  const trimmedCommitMessage = commitMessage.trim();

  useEffect(() => {
    if (open) setCommitMessage("Save session changes before moving");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && !pending && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert size={16} className="text-amber-500" />
            Session Has Local Changes
          </DialogTitle>
          <DialogDescription>
            This session has uncommitted changes. Choose how to handle them before moving it to
            another runtime.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <GitCommitHorizontal size={14} className="text-muted-foreground" />
              Commit The Changes
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Save the changes on the session branch, push them when applicable, then move the
              session.
            </p>
            <Textarea
              className="mt-3 min-h-20"
              value={commitMessage}
              onChange={(event) => setCommitMessage(event.target.value)}
              disabled={pending}
            />
            <div className="mt-3 flex justify-end">
              <Button
                disabled={pending || !trimmedCommitMessage}
                onClick={() =>
                  void onResolve({ strategy: "COMMIT", commitMessage: trimmedCommitMessage })
                }
              >
                Commit And Move
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <RefreshCw size={14} className="text-muted-foreground" />
              Discard All Changes
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Permanently discard all uncommitted and untracked changes, then move the session.
            </p>
            <div className="mt-3 flex justify-end">
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() => void onResolve({ strategy: "DISCARD" })}
              >
                Discard And Move
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
