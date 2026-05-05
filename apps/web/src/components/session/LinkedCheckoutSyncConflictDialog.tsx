import { useEffect, useMemo, useState } from "react";
import { GitBranch, GitCommitHorizontal, RefreshCw, TriangleAlert } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { cn } from "../../lib/utils";
import { LinkedCheckoutDiffViewer } from "./LinkedCheckoutDiffViewer";

interface LinkedCheckoutSyncConflictDialogProps {
  open: boolean;
  error: string | null;
  changedFiles: DesktopLinkedCheckoutChangedFile[];
  repoId: string | null | undefined;
  sessionGroupId: string;
  runtimeInstanceId: string | null;
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
  changedFiles,
  repoId,
  sessionGroupId,
  runtimeInstanceId,
  pending,
  onClose,
  onResolve,
}: LinkedCheckoutSyncConflictDialogProps) {
  const [commitMessage, setCommitMessage] = useState("Save local main-worktree changes");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setCommitMessage("Save local main-worktree changes");
      setSelectedPath(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || selectedPath) return;
    setSelectedPath(changedFiles[0]?.path ?? null);
  }, [changedFiles, open, selectedPath]);

  const selectedFile = useMemo(
    () => changedFiles.find((file) => file.path === selectedPath) ?? changedFiles[0] ?? null,
    [changedFiles, selectedPath],
  );
  const trimmedCommitMessage = commitMessage.trim();
  const commitDisabled = pending || trimmedCommitMessage.length === 0;

  return (
    <Dialog open={open} onOpenChange={(nextOpen: boolean) => !nextOpen && !pending && onClose()}>
      <DialogContent
        showCloseButton={!pending}
        className="grid-rows-[auto_minmax(0,1fr)] h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0 sm:max-w-[calc(100vw-2rem)]"
      >
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert size={16} className="text-amber-500" />
            Resolve Main Worktree Changes
          </DialogTitle>
          <DialogDescription>
            Sync stopped because the main worktree has local changes. Review the files, then choose
            how Trace should handle them before syncing this session.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="grid min-h-0 grid-cols-1 border-b border-border lg:grid-cols-[300px_minmax(0,1fr)] lg:border-b-0 lg:border-r">
            <div className="min-h-0 border-b border-border bg-muted/25 lg:border-r lg:border-b-0">
              <div className="flex h-11 items-center justify-between border-b border-border px-3">
                <span className="text-xs font-medium text-muted-foreground">Working Changes</span>
                <span className="text-xs text-muted-foreground">{changedFiles.length} files</span>
              </div>
              <div className="max-h-52 overflow-auto p-2 lg:max-h-none">
                {changedFiles.length === 0 ? (
                  <div className="px-2 py-6 text-left text-xs text-muted-foreground">
                    File details were not included in this bridge response. Restart Trace Desktop
                    and try Sync again to load the working-change diff.
                  </div>
                ) : (
                  changedFiles.map((file) => (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() => setSelectedPath(file.path)}
                      className={cn(
                        "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-muted",
                        selectedFile?.path === file.path && "bg-muted text-foreground",
                      )}
                    >
                      <span className={cn("w-4 shrink-0 font-mono", statusClass(file.status))}>
                        {file.status}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono">{file.path}</span>
                      <span className="shrink-0 text-green-500">+{file.additions}</span>
                      <span className="shrink-0 text-red-500">-{file.deletions}</span>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="min-h-0 bg-[#1e1e1e]">
              <div className="flex h-11 items-center gap-3 border-b border-white/10 px-4 text-xs text-white/70">
                <span className="min-w-0 truncate font-mono">
                  {selectedFile?.path ?? "No file selected"}
                </span>
                {selectedFile?.truncated || selectedFile?.contentTruncated ? (
                  <span className="shrink-0 text-amber-300">Preview truncated</span>
                ) : null}
              </div>
              <div className="h-[40dvh] lg:h-[calc(100dvh-9.75rem)]">
                <LinkedCheckoutDiffViewer
                  file={selectedFile}
                  repoId={repoId}
                  sessionGroupId={sessionGroupId}
                  runtimeInstanceId={runtimeInstanceId}
                />
              </div>
            </div>
          </div>

          <div className="min-h-0 overflow-auto px-5 py-4">
            {error ? (
              <div className="mb-4 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                {error}
              </div>
            ) : null}

            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <GitCommitHorizontal size={14} className="text-muted-foreground" />
                Commit The Changes
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Save the current main-worktree changes as a commit on the session branch, then sync
                your checkout to that new commit.
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

            <div className="mt-3 rounded-lg border border-border p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <GitBranch size={14} className="text-muted-foreground" />
                Reapply As Local Edits
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Sync to the session commit first, then apply these same file edits back on top of
                it. Use this when the changes are still work in progress and should stay
                uncommitted.
              </p>
              <div className="mt-3 flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => void onResolve({ strategy: "REBASE" })}
                  disabled={pending}
                >
                  Reapply And Sync
                </Button>
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-border p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <RefreshCw size={14} className="text-muted-foreground" />
                Discard All Changes
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Reset the main worktree to HEAD, remove untracked files, then sync cleanly. This
                deletes every file change shown on the left.
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

            <div className="mt-4 flex justify-end">
              <Button variant="ghost" onClick={onClose} disabled={pending}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function statusClass(status: string): string {
  switch (status[0]) {
    case "A":
      return "text-green-500";
    case "D":
      return "text-red-500";
    case "R":
    case "C":
      return "text-blue-500";
    default:
      return "text-amber-500";
  }
}
