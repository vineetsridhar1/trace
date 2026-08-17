import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { TraceLoader } from "../ui/trace-loader";
import type { FileTreeNode } from "./file-explorer-utils";
import { FileTreeItem } from "./FileTreeItem";

export function FileExplorer({
  tree,
  activeFilePath,
  loading,
  error,
  onRefresh,
  onLoadDirectory,
  onFileClick,
}: {
  tree: FileTreeNode[];
  activeFilePath?: string | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
  onLoadDirectory: (directoryPath: string) => Promise<void>;
  onFileClick: (filePath: string) => void;
}) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
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
  const loadedItemCount = useMemo(() => {
    let count = 0;
    const visit = (node: FileTreeNode) => {
      count += 1;
      for (const child of node.children) visit(child);
    };
    for (const node of tree) visit(node);
    return count;
  }, [tree]);
  const visibleTree = useMemo(() => filterFileTree(tree, search), [search, tree]);
  const visibleExpandedPaths = useMemo(() => {
    if (!search.trim()) return expandedPaths;
    const paths = new Set(expandedPaths);
    const visit = (node: FileTreeNode) => {
      if (node.isDirectory) paths.add(node.path);
      for (const child of node.children) visit(child);
    };
    for (const node of visibleTree) visit(node);
    return paths;
  }, [expandedPaths, search, visibleTree]);

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
    <div className="flex h-full flex-col bg-transparent">
      <div className="px-3 pb-3">
        <label className="flex h-9 items-center gap-2 rounded-lg border border-white/[0.1] bg-black/20 px-3 text-muted-foreground focus-within:border-white/20">
          <Search size={13} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[11px] text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="Search files"
            aria-label="Search files"
          />
          <span className="rounded bg-white/[0.07] px-1.5 py-0.5 text-[8px]">⌘P</span>
        </label>
      </div>
      <div className="flex h-8 shrink-0 items-center px-4">
        <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Workspace
        </span>
        <span className="ml-auto text-[8px] text-muted-foreground">{loadedItemCount} loaded</span>
        <button
          onClick={() => void onRefresh()}
          className="ml-2 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-white/[0.07] hover:text-foreground"
          title="Refresh"
        >
          <RefreshCw size={12} />
        </button>
      </div>
      <div className="native-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {visibleTree.map((node: FileTreeNode) => (
          <FileTreeItem
            key={node.path}
            node={node}
            activeFilePath={activeFilePath}
            depth={0}
            expandedPaths={visibleExpandedPaths}
            onToggle={handleToggle}
            onFileClick={onFileClick}
          />
        ))}
        {visibleTree.length === 0 && search.trim() ? (
          <p className="px-3 py-5 text-center text-[10px] text-muted-foreground">
            No matching files
          </p>
        ) : null}
      </div>
    </div>
  );
}

function filterFileTree(tree: FileTreeNode[], search: string): FileTreeNode[] {
  const query = search.trim().toLowerCase();
  if (!query) return tree;

  return tree.flatMap((node) => {
    const children = filterFileTree(node.children, query);
    if (node.name.toLowerCase().includes(query) || children.length > 0) {
      return [{ ...node, children }];
    }
    return [];
  });
}
