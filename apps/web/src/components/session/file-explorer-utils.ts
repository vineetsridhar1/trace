import { File, FileCode, FileJson, FileText, Image, Settings } from "lucide-react";

export interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  isLoaded?: boolean;
  isLoading?: boolean;
  error?: string | null;
  children: FileTreeNode[];
}

export interface FileTreeEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export function buildTree(files: string[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const nodeMap = new Map<string, FileTreeNode>();

  for (const filePath of files) {
    const parts = filePath.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLast = i === parts.length - 1;
      const nodePath = parts.slice(0, i + 1).join("/");
      const key = isLast ? `f:${nodePath}` : `d:${nodePath}`;

      let existing = nodeMap.get(key);
      if (!existing) {
        existing = { name, path: nodePath, isDirectory: !isLast, children: [] };
        nodeMap.set(key, existing);
        current.push(existing);
      }
      current = existing.children;
    }
  }

  const sortNodes = (nodes: FileTreeNode[]): void => {
    for (const n of nodes) sortNodes(n.children);
    nodes.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  };

  sortNodes(root);
  return root;
}

export function buildTreeFromEntries(
  entries: FileTreeEntry[],
  state: {
    loadedDirectoryPaths: Set<string>;
    loadingDirectoryPaths: Set<string>;
    directoryErrors: Record<string, string | undefined>;
  },
): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const nodeMap = new Map<string, FileTreeNode>();

  function ensureDirectory(parts: string[], index: number): FileTreeNode[] {
    if (index === 0) return root;

    const path = parts.slice(0, index).join("/");
    const existing = nodeMap.get(path);
    if (existing) return existing.children;

    const parentChildren = ensureDirectory(parts, index - 1);
    const node: FileTreeNode = {
      name: parts[index - 1],
      path,
      isDirectory: true,
      isLoaded: state.loadedDirectoryPaths.has(path),
      isLoading: state.loadingDirectoryPaths.has(path),
      error: state.directoryErrors[path] ?? null,
      children: [],
    };
    nodeMap.set(path, node);
    parentChildren.push(node);
    return node.children;
  }

  for (const entry of entries) {
    const parts = entry.path.split("/");
    const parentChildren = ensureDirectory(parts, parts.length - 1);
    const existing = nodeMap.get(entry.path);
    if (existing) {
      existing.name = entry.name;
      existing.isDirectory = entry.isDirectory;
      existing.isLoaded = entry.isDirectory
        ? state.loadedDirectoryPaths.has(entry.path)
        : undefined;
      existing.isLoading = entry.isDirectory
        ? state.loadingDirectoryPaths.has(entry.path)
        : undefined;
      existing.error = entry.isDirectory ? (state.directoryErrors[entry.path] ?? null) : null;
      continue;
    }

    const node: FileTreeNode = {
      name: entry.name,
      path: entry.path,
      isDirectory: entry.isDirectory,
      isLoaded: entry.isDirectory ? state.loadedDirectoryPaths.has(entry.path) : undefined,
      isLoading: entry.isDirectory ? state.loadingDirectoryPaths.has(entry.path) : undefined,
      error: entry.isDirectory ? (state.directoryErrors[entry.path] ?? null) : null,
      children: [],
    };
    nodeMap.set(entry.path, node);
    parentChildren.push(node);
  }

  const sortNodes = (nodes: FileTreeNode[]): void => {
    for (const n of nodes) sortNodes(n.children);
    nodes.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  };

  sortNodes(root);
  return root;
}

export function getFileIcon(name: string) {
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

export function getFileColor(name: string): string {
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
