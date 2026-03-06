import { useState, useMemo } from "react";
import { FiChevronDown, FiChevronRight, FiRefreshCw } from "react-icons/fi";
import { useWorktreeChanges } from "../hooks/useWorktreeChanges";

interface DiffFileSection {
  filePath: string;
  hunks: string;
}

function parseDiffIntoFiles(diff: string): DiffFileSection[] {
  const files: DiffFileSection[] = [];
  const fileParts = diff.split(/^diff --git /m).filter(Boolean);

  for (const part of fileParts) {
    const lines = part.split("\n");
    const headerLine = lines[0] ?? "";
    const match = headerLine.match(/b\/(.+)$/);
    const filePath = match?.[1] ?? headerLine;
    const hunks = lines.slice(1).join("\n");
    files.push({ filePath, hunks });
  }

  return files;
}

function DiffHunk({ content }: { content: string }) {
  return (
    <pre className="overflow-x-auto text-xs leading-relaxed">
      {content.split("\n").map((line, i) => {
        let className = "text-muted";
        if (line.startsWith("+")) className = "text-green-400 bg-green-500/10";
        else if (line.startsWith("-")) className = "text-red-400 bg-red-500/10";
        else if (line.startsWith("@@")) className = "text-cyan-400";

        return (
          <div key={i} className={`px-3 ${className}`}>
            {line || " "}
          </div>
        );
      })}
    </pre>
  );
}

function FileAccordion({ file }: { file: DiffFileSection }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border-b border-edge last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-primary hover:bg-surface-elevated"
      >
        {expanded ? (
          <FiChevronDown className="h-3.5 w-3.5 text-muted" />
        ) : (
          <FiChevronRight className="h-3.5 w-3.5 text-muted" />
        )}
        <span className="truncate font-mono text-xs">{file.filePath}</span>
      </button>
      {expanded && (
        <div className="border-t border-edge bg-surface-deep">
          <DiffHunk content={file.hunks} />
        </div>
      )}
    </div>
  );
}

interface WebWorktreeChangesProps {
  workspaceId: string;
  baseBranch: string;
}

export function WebWorktreeChanges({
  workspaceId,
  baseBranch,
}: WebWorktreeChangesProps) {
  const { diffData, loading, refresh } = useWorktreeChanges(
    workspaceId,
    baseBranch,
  );

  const allDiff = useMemo(() => {
    if (!diffData) return "";
    return [diffData.branchDiff, diffData.uncommittedDiff, diffData.stagedDiff]
      .filter(Boolean)
      .join("\n");
  }, [diffData]);

  const files = useMemo(() => parseDiffIntoFiles(allDiff), [allDiff]);

  if (loading && !diffData) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted">
        <span className="text-sm">Loading changes...</span>
      </div>
    );
  }

  if (!allDiff) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted">
        <span className="text-sm">No changes detected</span>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-edge px-3 py-2">
        <span className="text-xs font-medium text-muted">
          {files.length} file{files.length !== 1 ? "s" : ""} changed
        </span>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="rounded p-1 text-muted transition-colors hover:bg-surface-elevated hover:text-primary disabled:opacity-50"
        >
          <FiRefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {files.map((file) => (
          <FileAccordion key={file.filePath} file={file} />
        ))}
      </div>
    </div>
  );
}
