import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FolderClosed, FolderOpen } from "lucide-react";
import { cn } from "../../lib/utils";
import { buildTree, type FileTreeNode } from "./file-explorer-utils";
import type { BranchDiffFile } from "./branch-changes-types";
import { BranchChangedFileRow } from "./BranchChangedFileRow";

interface BranchChangesTreeProps {
  files: BranchDiffFile[];
  onFileClick: (filePath: string, status: string) => void;
}

export function BranchChangesTree({ files, onFileClick }: BranchChangesTreeProps) {
  const tree = useMemo(() => buildTree(files.map((file) => file.path)), [files]);
  const fileByPath = useMemo(
    () => new Map(files.map((file) => [file.path, file] as const)),
    [files],
  );
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() =>
    directoryPathsFromTree(tree),
  );

  useEffect(() => {
    setExpandedPaths(directoryPathsFromTree(tree));
  }, [tree]);

  const handleToggle = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  return (
    <>
      {tree.map((node) => (
        <BranchChangesTreeNode
          key={node.path}
          node={node}
          depth={0}
          expandedPaths={expandedPaths}
          fileByPath={fileByPath}
          onToggle={handleToggle}
          onFileClick={onFileClick}
        />
      ))}
    </>
  );
}

interface BranchChangesTreeNodeProps {
  node: FileTreeNode;
  depth: number;
  expandedPaths: Set<string>;
  fileByPath: Map<string, BranchDiffFile>;
  onToggle: (path: string) => void;
  onFileClick: (filePath: string, status: string) => void;
}

function BranchChangesTreeNode({
  node,
  depth,
  expandedPaths,
  fileByPath,
  onToggle,
  onFileClick,
}: BranchChangesTreeNodeProps) {
  const isExpanded = expandedPaths.has(node.path);
  const Icon = isExpanded ? FolderOpen : FolderClosed;

  if (!node.isDirectory) {
    const file = fileByPath.get(node.path);
    if (!file) return null;

    return (
      <BranchChangedFileRow
        file={file}
        depth={depth}
        pathPosition="none"
        onFileClick={onFileClick}
      />
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => onToggle(node.path)}
        className="flex w-full items-center gap-1 py-[1px] pr-2 text-left text-[12px] leading-[22px] text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
        style={{ paddingLeft: `${depth * 8 + 4}px` }}
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <Icon size={15} className={cn("shrink-0", "text-blue-400/80")} />
        <span className="truncate">{node.name}</span>
      </button>
      {isExpanded &&
        node.children.map((child) => (
          <BranchChangesTreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            expandedPaths={expandedPaths}
            fileByPath={fileByPath}
            onToggle={onToggle}
            onFileClick={onFileClick}
          />
        ))}
    </>
  );
}

function directoryPathsFromTree(tree: FileTreeNode[]): Set<string> {
  const paths = new Set<string>();
  const visit = (node: FileTreeNode) => {
    if (!node.isDirectory) return;
    paths.add(node.path);
    for (const child of node.children) visit(child);
  };

  for (const node of tree) visit(node);
  return paths;
}
