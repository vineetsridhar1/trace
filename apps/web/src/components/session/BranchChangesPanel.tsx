import { useCallback, useEffect, useState } from "react";
import { gql } from "@urql/core";
import { Circle, Loader2, RefreshCw } from "lucide-react";
import { client } from "../../lib/urql";
import { cn } from "../../lib/utils";

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

interface BranchDiffFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
}

interface BranchChangesPanelProps {
  sessionGroupId: string;
  onFileClick: (filePath: string, status: string) => void;
}

const statusColor: Record<string, string> = {
  A: "text-green-400 fill-green-400",
  M: "text-yellow-400 fill-yellow-400",
  D: "text-red-400 fill-red-400",
  R: "text-blue-400 fill-blue-400",
  C: "text-blue-400 fill-blue-400",
};

export function BranchChangesPanel({ sessionGroupId, onFileClick }: BranchChangesPanelProps) {
  const [files, setFiles] = useState<BranchDiffFile[]>([]);
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
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
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
        <button
          type="button"
          onClick={fetchDiff}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
          title="Refresh"
        >
          <RefreshCw size={12} />
        </button>
      </div>
      <div className="native-scrollbar min-h-0 flex-1 overflow-y-auto">
        {files.map((file: BranchDiffFile) => {
          const parts = file.path.split("/");
          const fileName = parts.pop() ?? file.path;
          const dirName = parts.length > 0 ? parts.join("/") + "/" : "";
          const color = statusColor[file.status] ?? "text-muted-foreground fill-muted-foreground";

          return (
            <button
              key={file.path}
              type="button"
              onClick={() => onFileClick(file.path, file.status)}
              className="flex w-full items-center gap-2 px-3 py-1 text-left transition-colors hover:bg-surface-hover"
            >
              <Circle size={6} className={cn("shrink-0", color)} />
              <span className="min-w-0 flex-1 truncate text-[11px]">
                <span className="text-muted-foreground">{dirName}</span>
                <span className="text-foreground">{fileName}</span>
              </span>
              <span className="shrink-0 font-mono text-[10px]">
                {file.additions > 0 && <span className="text-green-400">+{file.additions}</span>}
                {file.additions > 0 && file.deletions > 0 && " "}
                {file.deletions > 0 && <span className="text-red-400">-{file.deletions}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
