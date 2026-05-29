import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gql } from "@urql/core";
import { GitCommitHorizontal, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { client } from "../../lib/urql";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Textarea } from "../ui/textarea";
import { LinkedCheckoutDiffViewer } from "./LinkedCheckoutDiffViewer";

const SESSION_GROUP_WORKTREE_CHANGES_QUERY = gql`
  query SessionGroupWorktreeChanges($sessionGroupId: ID!) {
    sessionGroupWorktreeChanges(sessionGroupId: $sessionGroupId) {
      path
      status
      additions
      deletions
      diff
      truncated
      originalContent
      modifiedContent
      contentTruncated
    }
  }
`;

const REVERT_SESSION_GROUP_FILE_CHANGE_MUTATION = gql`
  mutation RevertSessionGroupFileChange($sessionGroupId: ID!, $filePath: String!) {
    revertSessionGroupFileChange(sessionGroupId: $sessionGroupId, filePath: $filePath)
  }
`;

interface CommitSessionGroupChangesDialogProps {
  open: boolean;
  sessionGroupId: string;
  pending: boolean;
  onClose: () => void;
  onCommit: (message: string) => Promise<void>;
  onChangesUpdated?: (hasChanges: boolean) => void;
}

export function CommitSessionGroupChangesDialog({
  open,
  sessionGroupId,
  pending,
  onClose,
  onCommit,
  onChangesUpdated,
}: CommitSessionGroupChangesDialogProps) {
  const [files, setFiles] = useState<DesktopLinkedCheckoutChangedFile[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState("Update files from Trace");
  const [loading, setLoading] = useState(false);
  const [revertingPath, setRevertingPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const emptyRetryAttemptedRef = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client
        .query(SESSION_GROUP_WORKTREE_CHANGES_QUERY, { sessionGroupId })
        .toPromise();
      if (result.error) throw result.error;
      setFiles(result.data?.sessionGroupWorktreeChanges ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load changes");
    } finally {
      setLoading(false);
    }
  }, [sessionGroupId]);

  useEffect(() => {
    if (!open) return;
    emptyRetryAttemptedRef.current = false;
    void refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open || loading || error || files.length > 0) return;
    if (emptyRetryAttemptedRef.current) return;
    emptyRetryAttemptedRef.current = true;
    const timer = window.setTimeout(() => void refresh(), 300);
    return () => window.clearTimeout(timer);
  }, [error, files.length, loading, open, refresh]);

  useEffect(() => {
    if (!open) {
      setSelectedPath(null);
      setCommitMessage("Update files from Trace");
      return;
    }
    if (selectedPath && files.some((file) => file.path === selectedPath)) return;
    setSelectedPath(files[0]?.path ?? null);
  }, [files, open, selectedPath]);

  useEffect(() => {
    if (!open) return;
    onChangesUpdated?.(files.length > 0);
  }, [files.length, onChangesUpdated, open]);

  const selectedFile = useMemo(
    () => files.find((file) => file.path === selectedPath) ?? files[0] ?? null,
    [files, selectedPath],
  );

  const handleRevert = useCallback(
    async (filePath: string) => {
      setRevertingPath(filePath);
      try {
        const result = await client
          .mutation(REVERT_SESSION_GROUP_FILE_CHANGE_MUTATION, { sessionGroupId, filePath })
          .toPromise();
        if (result.error || result.data?.revertSessionGroupFileChange !== true) {
          throw new Error(result.error?.message ?? "Failed to revert file");
        }
        toast.success("File reverted");
        await refresh();
      } catch (err) {
        toast.error("Failed to revert file", {
          description: err instanceof Error ? err.message : undefined,
        });
      } finally {
        setRevertingPath(null);
      }
    },
    [refresh, sessionGroupId],
  );

  const trimmedMessage = commitMessage.trim();
  const commitDisabled = pending || loading || files.length === 0 || trimmedMessage.length === 0;
  const isDesktopShell = typeof window !== "undefined" && typeof window.trace !== "undefined";

  return (
    <Dialog open={open} onOpenChange={(nextOpen: boolean) => !nextOpen && !pending && onClose()}>
      <DialogContent
        showCloseButton={!pending}
        className={cn(
          "grid-rows-[auto_minmax(0,1fr)] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0 sm:max-w-[calc(100vw-2rem)]",
          isDesktopShell
            ? "top-[calc(50dvh+1.5rem)] h-[calc(100dvh-5rem)] max-h-[calc(100dvh-5rem)]"
            : "h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)]",
        )}
      >
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <GitCommitHorizontal size={16} className="text-muted-foreground" />
            Commit Workspace Changes
          </DialogTitle>
          <DialogDescription>
            Review the current session worktree changes, revert individual files if needed, then
            commit the remaining changes.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="grid min-h-0 grid-cols-1 border-b border-border lg:grid-cols-[300px_minmax(0,1fr)] lg:border-b-0 lg:border-r">
            <div className="min-h-0 border-b border-border bg-muted/25 lg:border-r lg:border-b-0">
              <div className="flex h-11 items-center justify-between border-b border-border px-3">
                <span className="text-xs font-medium text-muted-foreground">Workspace Changes</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{files.length} files</span>
                  <button
                    type="button"
                    onClick={() => void refresh()}
                    disabled={loading || pending}
                    className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                    title="Refresh changes"
                  >
                    <RefreshCw size={12} />
                  </button>
                </div>
              </div>
              <div className="max-h-52 overflow-auto p-2 lg:max-h-none">
                {error ? (
                  <div className="px-2 py-6 text-left text-xs text-red-400">{error}</div>
                ) : files.length === 0 ? (
                  <div className="px-2 py-6 text-left text-xs text-muted-foreground">
                    {loading ? "Loading changes..." : "No workspace changes to commit."}
                  </div>
                ) : (
                  files.map((file) => (
                    <div
                      key={file.path}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedPath(file.path)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        setSelectedPath(file.path);
                      }}
                      className={cn(
                        "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left text-xs outline-none hover:bg-muted focus:bg-muted",
                        selectedFile?.path === file.path && "bg-muted text-foreground",
                      )}
                    >
                      <span className={cn("w-4 shrink-0 font-mono", statusClass(file.status))}>
                        {file.status}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono">{file.path}</span>
                      <span className="shrink-0 text-green-500">+{file.additions}</span>
                      <span className="shrink-0 text-red-500">-{file.deletions}</span>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleRevert(file.path);
                        }}
                        disabled={pending || revertingPath === file.path}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
                        title="Revert this file"
                      >
                        <RotateCcw size={12} />
                      </button>
                    </div>
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
                  repoId={null}
                  sessionGroupId={sessionGroupId}
                  runtimeInstanceId={null}
                />
              </div>
            </div>
          </div>

          <div className="min-h-0 overflow-auto px-5 py-4">
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <GitCommitHorizontal size={14} className="text-muted-foreground" />
                Commit The Changes
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Create a git commit in this session worktree from the files shown on the left.
              </p>
              <Textarea
                className="mt-3 min-h-20"
                value={commitMessage}
                onChange={(event) => setCommitMessage(event.target.value)}
                placeholder="Commit message"
                disabled={pending}
              />
              <div className="mt-3 flex justify-end">
                <Button onClick={() => void onCommit(trimmedMessage)} disabled={commitDisabled}>
                  {pending ? "Committing..." : "Commit Changes"}
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
