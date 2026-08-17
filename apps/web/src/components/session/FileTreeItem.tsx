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
          "relative flex h-6 w-full items-center gap-1.5 rounded-md pr-2 text-left text-[11px] text-foreground/85 transition-colors hover:bg-white/[0.06] hover:text-foreground",
          "cursor-pointer",
          activeFilePath === node.path && "bg-white/[0.08] text-foreground",
        )}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        {activeFilePath === node.path ? (
          <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-blue-400" />
        ) : null}
        {node.isDirectory ? (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
            {node.isLoading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : isExpanded ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
          </span>
        ) : (
          <span className="h-4 w-4 shrink-0" />
        )}
        {!node.isDirectory ? <FileIcon path={node.path} size={14} /> : null}
        <span className="truncate">{node.name}</span>
    </button>
  );
}
