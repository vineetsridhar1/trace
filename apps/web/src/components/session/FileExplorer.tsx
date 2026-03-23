import { useCallback, useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import {
  ChevronDown,
  ChevronRight,
  File,
  FileCode,
  FileJson,
  FileText,
  FolderClosed,
  FolderOpen,
  Image,
  Loader2,
  RefreshCw,
  Settings,
} from "lucide-react";
import { client } from "../../lib/urql";
import { cn } from "../../lib/utils";

const SESSION_GROUP_FILES_QUERY = gql`
  query SessionGroupFiles($sessionGroupId: ID!) {
    sessionGroupFiles(sessionGroupId: $sessionGroupId)
  }
`;

interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: FileTreeNode[];
}

function buildTree(files: string[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];

  for (const filePath of files) {
    const parts = filePath.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLast = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join("/");

      let existing = current.find((n) => n.name === name && n.isDirectory === !isLast);
      if (!existing) {
        existing = { name, path, isDirectory: !isLast, children: [] };
        current.push(existing);
      }
      current = existing.children;
    }
  }

  // Sort: directories first, then alphabetically
  const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
    return nodes
      .map((n) => ({ ...n, children: sortNodes(n.children) }))
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  };

  return sortNodes(root);
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "py":
    case "rb":
    case "go":
    case "rs":
    case "java":
    case "c":
    case "cpp":
    case "h":
    case "css":
    case "scss":
    case "html":
    case "vue":
    case "svelte":
      return FileCode;
    case "json":
    case "jsonc":
      return FileJson;
    case "md":
    case "mdx":
    case "txt":
    case "rst":
      return FileText;
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "svg":
    case "ico":
    case "webp":
      return Image;
    case "yaml":
    case "yml":
    case "toml":
    case "ini":
    case "env":
    case "conf":
      return Settings;
    default:
      return File;
  }
}

function getFileColor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
      return "text-blue-400";
    case "js":
    case "jsx":
      return "text-yellow-400";
    case "json":
    case "jsonc":
      return "text-yellow-300";
    case "py":
      return "text-green-400";
    case "css":
    case "scss":
      return "text-purple-400";
    case "html":
      return "text-orange-400";
    case "md":
    case "mdx":
      return "text-blue-300";
    case "go":
      return "text-cyan-400";
    case "rs":
      return "text-orange-300";
    case "svg":
    case "png":
    case "jpg":
      return "text-green-300";
    default:
      return "text-muted-foreground";
  }
}

function FileTreeItem({
  node,
  depth,
  expandedPaths,
  onToggle,
}: {
  node: FileTreeNode;
  depth: number;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
}) {
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
        onClick={() => node.isDirectory && onToggle(node.path)}
        className={cn(
          "flex w-full items-center gap-1 py-[1px] pr-2 text-left text-[13px] leading-[22px] hover:bg-[#2a2d2e]",
          node.isDirectory ? "cursor-pointer" : "cursor-default",
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

export function FileExplorer({ sessionGroupId }: { sessionGroupId: string }) {
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client
        .query(SESSION_GROUP_FILES_QUERY, { sessionGroupId })
        .toPromise();
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

  // Auto-expand single-child directories on initial load
  useEffect(() => {
    if (tree.length === 0) return;
    const autoExpand = new Set<string>();
    const walk = (nodes: FileTreeNode[]) => {
      for (const node of nodes) {
        if (node.isDirectory) {
          autoExpand.add(node.path);
          if (node.children.length <= 3) {
            walk(node.children);
          }
        }
      }
    };
    // Only expand first level + single-child paths
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
        {tree.map((node) => (
          <FileTreeItem
            key={node.path}
            node={node}
            depth={0}
            expandedPaths={expandedPaths}
            onToggle={handleToggle}
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
