import { useEffect, useState } from "react";
import { GitBranch, FolderGit2 } from "lucide-react";
import { toast } from "sonner";
import { REPO_WORKTREES_QUERY, IMPORT_WORKTREE_MUTATION } from "@trace/client-core";
import { client } from "../../lib/urql";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { TraceLoader } from "../ui/trace-loader";
import { cn } from "../../lib/utils";

interface RepoWorktree {
  path: string;
  branch: string | null;
  head: string | null;
  isMain: boolean;
  isTraceManaged: boolean;
}

interface ImportWorktreeDialogProps {
  /** The not-yet-started session that will adopt the selected worktree. */
  sessionId: string;
  repoId: string;
  /** Optional — the server picks an accessible local runtime for the repo when omitted. */
  runtimeInstanceId?: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Lists the repo's existing on-disk worktrees on a local runtime and adopts the
 * selected one into the current session instead of creating a fresh Trace worktree.
 */
export function ImportWorktreeDialog({
  sessionId,
  repoId,
  runtimeInstanceId,
  open,
  onClose,
}: ImportWorktreeDialogProps) {
  const [worktrees, setWorktrees] = useState<RepoWorktree[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importingPath, setImportingPath] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    client
      .query(REPO_WORKTREES_QUERY, {
        repoId,
        runtimeInstanceId: runtimeInstanceId ?? null,
      })
      .toPromise()
      .then(
        (result: {
          error?: { message?: string } | null;
          data?: { repoWorktrees?: RepoWorktree[] };
        }) => {
          if (result.error) {
            setWorktrees([]);
            setError(describeWorktreeError(result.error.message));
          } else {
            setWorktrees(result.data?.repoWorktrees ?? []);
          }
        },
      )
      .catch(() => {
        setWorktrees([]);
        setError("Could not load worktrees");
      })
      .finally(() => setLoading(false));
  }, [open, repoId, runtimeInstanceId]);

  const handleImport = async (worktree: RepoWorktree) => {
    if (importingPath) return;
    setImportingPath(worktree.path);
    try {
      const result = await client
        .mutation(IMPORT_WORKTREE_MUTATION, {
          sessionId,
          worktreePath: worktree.path,
          branch: worktree.branch,
        })
        .toPromise();

      if (result.error) {
        toast.error("Failed to import worktree", { description: result.error.message });
        return;
      }
      // The resulting event updates the store; just close and stay on this session.
      onClose();
    } finally {
      setImportingPath(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => !next && onClose()}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import from worktree</DialogTitle>
          <DialogDescription>
            Start a session in an existing worktree of this repository. Trace uses its current
            branch as-is and never removes it.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <TraceLoader size={16} />
            </div>
          )}
          {!loading && error && <p className="px-1 py-6 text-sm text-destructive">{error}</p>}
          {!loading && !error && worktrees.length === 0 && (
            <p className="px-1 py-6 text-sm text-muted-foreground">
              No importable worktrees found. Create one with{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">git worktree add</code> and try
              again.
            </p>
          )}
          <div className="flex flex-col gap-1">
            {worktrees.map((worktree) => (
              <button
                key={worktree.path}
                type="button"
                disabled={importingPath !== null}
                onClick={() => void handleImport(worktree)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md border border-border px-3 py-2 text-left",
                  "transition-colors hover:bg-surface-elevated disabled:opacity-50",
                )}
              >
                <FolderGit2 size={16} className="shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="break-all text-sm text-foreground">{worktree.path}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <GitBranch size={11} className="shrink-0" />
                    <span className="truncate font-mono">{worktree.branch ?? "detached"}</span>
                    {worktree.isMain && <span className="ml-1 text-[10px] uppercase">main</span>}
                  </p>
                </div>
                {importingPath === worktree.path && <TraceLoader size={14} showLabel={false} />}
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function describeWorktreeError(message: string | undefined): string {
  if (message && /not cloned/i.test(message)) {
    return "Repo not cloned on any connected local bridge yet.";
  }
  if (message && /local runtimes/i.test(message)) {
    return "Worktree import is only available on local (desktop) runtimes.";
  }
  return "Could not load worktrees";
}
