import { useCallback, useEffect, useState } from "react";
import { gql } from "@urql/core";
import { AlertTriangle, GitCompareArrows, List, ListTree, RefreshCw } from "lucide-react";
import { client } from "../../lib/urql";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { TraceLoader } from "../ui/trace-loader";
import type { BranchChangesViewMode, BranchDiffFile } from "./branch-changes-types";
import { BranchChangedFileRow } from "./BranchChangedFileRow";
import { BranchChangesTree } from "./BranchChangesTree";

const SESSION_GROUP_BRANCH_DIFF_QUERY = gql`
  query SessionGroupBranchDiff($sessionGroupId: ID!) {
    sessionGroupBranchDiff(sessionGroupId: $sessionGroupId) {
      path
      status
      additions
      deletions
    }
  }
`;

interface BranchChangesPanelProps {
  sessionGroupId: string;
  onFileClick: (filePath: string, status: string) => void;
}

export function BranchChangesPanel({ sessionGroupId, onFileClick }: BranchChangesPanelProps) {
  const [files, setFiles] = useState<BranchDiffFile[]>([]);
  const [viewMode, setViewMode] = useState<BranchChangesViewMode>("tree");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDiff = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client
        .query(SESSION_GROUP_BRANCH_DIFF_QUERY, { sessionGroupId })
        .toPromise();
      if (result.error) {
        setError(result.error.message);
      } else {
        setFiles(result.data?.sessionGroupBranchDiff ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load diff");
    } finally {
      setLoading(false);
    }
  }, [sessionGroupId]);

  useEffect(() => {
    fetchDiff();
  }, [fetchDiff]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <TraceLoader size={16} showLabel={false} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="native-scrollbar h-full overflow-y-auto px-4 py-5">
        <div className="rounded-xl border border-border/70 bg-background/25 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-destructive/20 bg-destructive/10 text-destructive">
              <AlertTriangle size={16} />
            </div>
            <div className="min-w-0 pt-0.5">
              <h3 className="text-xs font-semibold text-foreground">Unable to compare branches</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Make sure this branch is pushed and that Trace has access to the GitHub repository.
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void fetchDiff()}>
              <RefreshCw size={12} />
              Try again
            </Button>
          </div>

          <details className="group mt-4 border-t border-border/60 pt-3">
            <summary className="cursor-pointer list-none text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground">
              Technical details
            </summary>
            <p className="mt-2 break-words rounded-lg bg-muted/50 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
              {error.replace(/^\[GraphQL\]\s*/, "")}
            </p>
          </details>
        </div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-5 pb-12 text-center">
        <div className="flex max-w-56 flex-col items-center">
          <div className="mb-3 flex size-10 items-center justify-center rounded-xl border border-border/70 bg-background/25 text-muted-foreground shadow-sm">
            <GitCompareArrows size={17} />
          </div>
          <h3 className="text-xs font-semibold text-foreground">No branch changes</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            This branch currently matches its base branch.
          </p>
          <Button size="sm" variant="ghost" className="mt-3" onClick={() => void fetchDiff()}>
            <RefreshCw size={12} />
            Refresh
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1.5">
        <span className="text-[11px] text-muted-foreground">
          {files.length} file{files.length !== 1 ? "s" : ""} changed
        </span>
        <div className="flex items-center gap-1">
          <div className="flex items-center rounded-md border border-border bg-surface-deep p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("tree")}
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground",
                viewMode === "tree" && "bg-surface-elevated text-foreground",
              )}
              title="Tree view"
              aria-pressed={viewMode === "tree"}
            >
              <ListTree size={12} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("flat")}
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground",
                viewMode === "flat" && "bg-surface-elevated text-foreground",
              )}
              title="Flat view"
              aria-pressed={viewMode === "flat"}
            >
              <List size={12} />
            </button>
          </div>
          <button
            type="button"
            onClick={fetchDiff}
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>
      <div className="native-scrollbar min-h-0 flex-1 overflow-y-auto">
        {viewMode === "tree" ? (
          <BranchChangesTree files={files} onFileClick={onFileClick} />
        ) : (
          files.map((file) => (
            <BranchChangedFileRow
              key={file.path}
              file={file}
              pathPosition="after"
              onFileClick={onFileClick}
            />
          ))
        )}
      </div>
    </div>
  );
}
