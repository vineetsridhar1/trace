import { useCallback, useEffect, useState } from "react";
import { gql } from "@urql/core";
import { List, ListTree, RefreshCw } from "lucide-react";
import { client } from "../../lib/urql";
import { cn } from "../../lib/utils";
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
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-xs text-red-400">Failed to load changes</p>
        <p className="text-[11px] text-muted-foreground">{error}</p>
        <button onClick={fetchDiff} className="mt-1 text-[11px] text-blue-400 hover:underline">
          Retry
        </button>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-xs text-muted-foreground">No changes on this branch</p>
        <button onClick={fetchDiff} className="mt-1 text-[11px] text-blue-400 hover:underline">
          Refresh
        </button>
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
