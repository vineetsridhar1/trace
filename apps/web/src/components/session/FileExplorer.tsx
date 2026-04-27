import { useCallback, useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import { Loader2, RefreshCw } from "lucide-react";
import { client } from "../../lib/urql";
import { buildTree, type FileTreeNode } from "./file-explorer-utils";
import { FileTreeItem } from "./FileTreeItem";

const SESSION_GROUP_FILES_QUERY = gql`
  query SessionGroupFiles($sessionGroupId: ID!) {
    sessionGroupFiles(sessionGroupId: $sessionGroupId)
  }
`;

export function FileExplorer({
  sessionGroupId,
  onFileClick,
}: {
  sessionGroupId: string;
  onFileClick: (filePath: string) => void;
}) {
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.query(SESSION_GROUP_FILES_QUERY, { sessionGroupId }).toPromise();
      if (result.error) {
        setError(result.error.message);
      } else {
        setFiles(result.data?.sessionGroupFiles ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, [sessionGroupId]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const tree = useMemo(() => buildTree(files), [files]);

  // Auto-expand first level + single-child directory chains on initial load
  useEffect(() => {
    if (tree.length === 0) return;
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
  }, [tree]);

  const handleToggle = useCallback((path: string) => {
    setExpandedPaths((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

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
        <p className="text-xs text-muted-foreground">{error}</p>
        <button
          onClick={fetchFiles}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw size={12} />
          Retry
        </button>
      </div>
    );
  }

  if (files.length === 0) {
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
          onClick={fetchFiles}
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
          {files.length} file{files.length !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
