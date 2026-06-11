import { ChevronDown, ChevronRight, FolderClosed, FolderOpen, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";
import type { FileTreeNode } from "./file-explorer-utils";
import { FileIcon } from "./FileIcon";

export interface FileTreeItemProps {
  key?: React.Key;
  node: FileTreeNode;
  depth: number;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  onFileClick: (path: string) => void;
}

export function FileTreeItem({
  node,
  depth,
  expandedPaths,
  onToggle,
  onFileClick,
}: FileTreeItemProps) {
  const isExpanded = expandedPaths.has(node.path);
  const FolderIcon = isExpanded ? FolderOpen : FolderClosed;

  return (
    <>
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
          "flex w-full items-center gap-1 py-[1px] pr-2 text-left text-[13px] leading-[22px] hover:bg-[#2a2d2e]",
          "cursor-pointer",
        )}
        style={{ paddingLeft: `${depth * 8 + 4}px` }}
      >
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
        {node.isDirectory ? (
          <FolderIcon size={16} className="shrink-0 text-blue-400/80" />
        ) : (
          <FileIcon path={node.path} size={16} />
        )}
        <span className="truncate text-[#cccccc]">{node.name}</span>
      </button>
      {node.isDirectory && isExpanded && (
        <>
          {node.children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              onToggle={onToggle}
              onFileClick={onFileClick}
            />
          ))}
          {node.error && (
            <div
              className="py-[1px] text-[13px] italic leading-[22px] text-destructive"
              style={{ paddingLeft: `${(depth + 1) * 8 + 24}px` }}
            >
              {node.error}
            </div>
          )}
          {!node.error && node.isLoaded && node.children.length === 0 && (
            <div
              className="py-[1px] text-[13px] italic leading-[22px] text-muted-foreground"
              style={{ paddingLeft: `${(depth + 1) * 8 + 24}px` }}
            >
              empty
            </div>
          )}
        </>
      )}
    </>
  );
}
