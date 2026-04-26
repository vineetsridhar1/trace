import { useEffect, useState } from "react";
import { GitBranch, GitCommitHorizontal, RefreshCw, TriangleAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

interface LinkedCheckoutSyncConflictDialogProps {
  open: boolean;
  error: string | null;
  pending: boolean;
  onClose: () => void;
  onResolve: (input: {
    strategy: "DISCARD" | "COMMIT" | "REBASE";
    commitMessage?: string;
  }) => Promise<void>;
}

export function LinkedCheckoutSyncConflictDialog({
  open,
  error,
  pending,
  onClose,
  onResolve,
}: LinkedCheckoutSyncConflictDialogProps) {
  const [commitMessage, setCommitMessage] = useState("Save local main-worktree changes");

  useEffect(() => {
    if (!open) {
      setCommitMessage("Save local main-worktree changes");
    }
  }, [open]);

  const trimmedCommitMessage = commitMessage.trim();
  const commitDisabled = pending || trimmedCommitMessage.length === 0;

  return (
    <Dialog open={open} onOpenChange={(nextOpen: boolean) => !nextOpen && !pending && onClose()}>
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert size={16} className="text-amber-500" />
            Resolve Main Worktree Changes
          </DialogTitle>
          <DialogDescription>
            Sync stopped because the main worktree has local changes. Choose how Trace should
            resolve them before syncing this session.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {error}
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <GitCommitHorizontal size={14} className="text-muted-foreground" />
              Commit The Changes
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Import the current main-worktree changes into the session branch, create a commit,
              then sync to that new commit.
            </p>
            <Textarea
              className="mt-3 min-h-20"
              value={commitMessage}
              onChange={(event) => setCommitMessage(event.target.value)}
              placeholder="Commit message"
              disabled={pending}
            />
            <div className="mt-3 flex justify-end">
              <Button
                onClick={() =>
                  void onResolve({ strategy: "COMMIT", commitMessage: trimmedCommitMessage })
                }
                disabled={commitDisabled}
              >
                Commit And Sync
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <RefreshCw size={14} className="text-muted-foreground" />
                Discard All Changes
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Reset the main worktree to HEAD, remove untracked files, then sync cleanly.
              </p>
              <div className="mt-3 flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => void onResolve({ strategy: "DISCARD" })}
                  disabled={pending}
                >
                  Discard And Sync
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <GitBranch size={14} className="text-muted-foreground" />
                Replay Local Changes
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Replay the current main-worktree changes onto the synced session commit and keep
                them as local edits.
              </p>
              <div className="mt-3 flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => void onResolve({ strategy: "REBASE" })}
                  disabled={pending}
                >
                  Replay And Sync
                </Button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
