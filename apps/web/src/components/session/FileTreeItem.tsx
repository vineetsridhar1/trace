import { ChevronDown, ChevronRight, FolderClosed, FolderOpen } from "lucide-react";
import { cn } from "../../lib/utils";
import type { FileTreeNode } from "./file-explorer-utils";
import { getFileIcon, getFileColor } from "./file-explorer-utils";

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
  const Icon = node.isDirectory
    ? isExpanded
      ? FolderOpen
      : FolderClosed
    : getFileIcon(node.name);
  const iconColor = node.isDirectory ? "text-blue-400/80" : getFileColor(node.name);

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
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        ) : (
          <span className="h-4 w-4 shrink-0" />
        )}
        <Icon size={16} className={cn("shrink-0", iconColor)} />
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
          {node.children.length === 0 && (
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
