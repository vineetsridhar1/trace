import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { TraceLoader } from "../ui/trace-loader";
import type { FileTreeNode } from "./file-explorer-utils";
import { FileTreeItem } from "./FileTreeItem";

export function FileExplorer({
  tree,
  loading,
  error,
  onRefresh,
  onLoadDirectory,
  onFileClick,
}: {
  tree: FileTreeNode[];
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
  onLoadDirectory: (directoryPath: string) => Promise<void>;
  onFileClick: (filePath: string) => void;
}) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const didAutoExpandRef = useRef(false);
  const loadedDirectoryPaths = useMemo(() => {
    const paths = new Set<string>();
    const visit = (node: FileTreeNode) => {
      if (!node.isDirectory) return;
      if (node.isLoaded) paths.add(node.path);
      for (const child of node.children) visit(child);
    };
    for (const node of tree) visit(node);
    return paths;
  }, [tree]);

  // Auto-expand first level + single-child directory chains on initial load
  useEffect(() => {
    if (tree.length === 0) {
      didAutoExpandRef.current = false;
      setExpandedPaths(new Set());
      return;
    }
    if (didAutoExpandRef.current) return;
    const autoExpand = new Set<string>();
    for (const node of tree) {
      if (node.isDirectory) {
        autoExpand.add(node.path);
        let current = node;
        while (current.children.length === 1 && current.children[0].isDirectory) {
          current = current.children[0];
          autoExpand.add(current.path);
        }
      }
    }
    setExpandedPaths(autoExpand);
    didAutoExpandRef.current = true;
  }, [tree]);

  const handleToggle = useCallback(
    (path: string) => {
      setExpandedPaths((prev: Set<string>) => {
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        return next;
      });
      if (!loadedDirectoryPaths.has(path)) {
        void onLoadDirectory(path);
      }
    },
    [loadedDirectoryPaths, onLoadDirectory],
  );

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
        <p className="text-xs text-muted-foreground">{error}</p>
        <button
          onClick={() => void onRefresh()}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw size={12} />
          Retry
        </button>
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-muted-foreground">No files found</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#1e1e1e]">
      <div className="flex shrink-0 items-center justify-between border-b border-[#2d2d2d] px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#bbbbbb]">
          Explorer
        </span>
        <button
          onClick={() => void onRefresh()}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          title="Refresh"
        >
          <RefreshCw size={12} />
        </button>
      </div>
      <div className="native-scrollbar min-h-0 flex-1 overflow-y-auto py-0.5">
        {tree.map((node: FileTreeNode) => (
          <FileTreeItem
            key={node.path}
            node={node}
            depth={0}
            expandedPaths={expandedPaths}
            onToggle={handleToggle}
            onFileClick={onFileClick}
          />
        ))}
      </div>
      <div className="shrink-0 border-t border-[#2d2d2d] px-3 py-1">
        <span className="text-[11px] text-muted-foreground">
          {tree.length} item{tree.length !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
