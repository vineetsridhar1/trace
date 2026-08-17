import { Circle } from "lucide-react";
import { cn } from "../../lib/utils";
import type { BranchDiffFile } from "./branch-changes-types";
import { branchChangeStatusColor } from "./branch-changes-utils";
import { FileIcon } from "./FileIcon";

interface BranchChangedFileRowProps {
  file: BranchDiffFile;
  onFileClick: (filePath: string, status: string) => void;
  depth?: number;
  pathPosition?: "before" | "after" | "none";
}

export function BranchChangedFileRow({
  file,
  onFileClick,
  depth,
  pathPosition = "before",
}: BranchChangedFileRowProps) {
  const parts = file.path.split("/");
  const fileName = parts.pop() ?? file.path;
  const dirName = parts.join("/");
  const color =
    branchChangeStatusColor[file.status] ?? "text-muted-foreground fill-muted-foreground";

  return (
    <button
      type="button"
      onClick={() => onFileClick(file.path, file.status)}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md pr-2 text-left text-sm transition-colors hover:bg-white/10",
        depth === undefined && "px-2",
      )}
      style={depth === undefined ? undefined : { paddingLeft: `${depth * 14 + 8}px` }}
    >
      <Circle size={6} className={cn("shrink-0", color)} />
      <FileIcon path={file.path} size={16} />
      <span className="min-w-0 flex-1 truncate">
        {pathPosition === "before" && dirName && (
          <span className="text-muted-foreground">{dirName}/</span>
        )}
        <span className="text-foreground">{fileName}</span>
        {pathPosition === "after" && dirName && (
          <span className="ml-2 text-muted-foreground">{dirName}</span>
        )}
      </span>
      <span className="shrink-0 font-mono text-[10px]">
        {file.additions > 0 && <span className="text-green-400">+{file.additions}</span>}
        {file.additions > 0 && file.deletions > 0 && " "}
        {file.deletions > 0 && <span className="text-red-400">-{file.deletions}</span>}
      </span>
    </button>
  );
}
