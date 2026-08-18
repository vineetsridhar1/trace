import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";
import type { FileTreeNode } from "./file-explorer-utils";
import { FileIcon } from "./FileIcon";

export interface FileTreeItemProps {
  key?: React.Key;
  node: FileTreeNode;
  activeFilePath?: string | null;
  depth: number;
  isExpanded: boolean;
  onToggle: (path: string) => void;
  onFileClick: (path: string) => void;
}

export function FileTreeItem({
  node,
  activeFilePath,
  depth,
  isExpanded,
  onToggle,
  onFileClick,
}: FileTreeItemProps) {
  return (
    <button
      type="button"
      onClick={() => {
        if (node.isDirectory) {
          onToggle(node.path);
        } else {
          onFileClick(node.path);
        }
      }}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md pr-2 text-left text-sm text-foreground transition-colors hover:bg-white/10",
        "cursor-pointer",
        activeFilePath === node.path && "bg-white/10 font-medium",
      )}
      style={{ paddingLeft: `${depth * 14 + 8}px` }}
    >
      {node.isDirectory ? (
        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
          {node.isLoading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : isExpanded ? (
            <ChevronDown size={14} />
          ) : (
            <ChevronRight size={14} />
          )}
        </span>
      ) : (
        <span className="size-4 shrink-0" />
      )}
      {!node.isDirectory ? <FileIcon path={node.path} size={16} /> : null}
      <span className="truncate">{node.name}</span>
    </button>
  );
}
