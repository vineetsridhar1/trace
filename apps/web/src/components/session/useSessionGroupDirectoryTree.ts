import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gql } from "@urql/core";
import { client } from "../../lib/urql";
import { buildTreeFromEntries, type FileTreeEntry, type FileTreeNode } from "./file-explorer-utils";

const SESSION_GROUP_FILE_TREE_QUERY = gql`
  query SessionGroupFileTree($sessionGroupId: ID!) {
    sessionGroupFileTree(sessionGroupId: $sessionGroupId) {
      paths
      truncated
    }
  }
`;

const SESSION_GROUP_DIRECTORY_ENTRIES_QUERY = gql`
  query SessionGroupDirectoryEntries($sessionGroupId: ID!, $directoryPath: String!, $depth: Int) {
    sessionGroupDirectoryEntries(
      sessionGroupId: $sessionGroupId
      directoryPath: $directoryPath
      depth: $depth
    ) {
      name
      path
      isDirectory
    }
  }
`;

export interface SessionGroupDirectoryTreeState {
  tree: FileTreeNode[];
  loading: boolean;
  error: string | null;
  loadedDirectoryPaths: Set<string>;
  loadingDirectoryPaths: Set<string>;
  refreshTree: () => Promise<void>;
  loadDirectory: (directoryPath: string) => Promise<void>;
}

function parentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function mergeEntries(
  current: Record<string, FileTreeEntry>,
  entries: FileTreeEntry[],
): Record<string, FileTreeEntry> {
  const next = { ...current };
  for (const entry of entries) {
    next[entry.path] = entry;
  }
  return next;
}

/**
 * Build a fully-loaded tree from a flat recursive path list. Every ancestor
 * directory is marked loaded so expansion never triggers a follow-up fetch.
 */
function entriesFromPaths(paths: string[]): {
  entriesByPath: Record<string, FileTreeEntry>;
  directoryPaths: Set<string>;
} {
  const entriesByPath: Record<string, FileTreeEntry> = {};
  const directoryPaths = new Set<string>([""]);
  for (const path of paths) {
    const parts = path.split("/");
    entriesByPath[path] = { name: parts[parts.length - 1], path, isDirectory: false };
    for (let i = 1; i < parts.length; i++) {
      directoryPaths.add(parts.slice(0, i).join("/"));
    }
  }
  return { entriesByPath, directoryPaths };
}

export function useSessionGroupDirectoryTree(
  sessionGroupId: string,
): SessionGroupDirectoryTreeState {
  const [entriesByPath, setEntriesByPath] = useState<Record<string, FileTreeEntry>>({});
  const [loadedDirectoryPaths, setLoadedDirectoryPaths] = useState<Set<string>>(new Set());
  const [loadingDirectoryPaths, setLoadingDirectoryPaths] = useState<Set<string>>(new Set());
  const [directoryErrors, setDirectoryErrors] = useState<Record<string, string | undefined>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlightPathsRef = useRef<Set<string>>(new Set());

  const loadDirectoryWithDepth = useCallback(
    async (directoryPath: string, depth: number, reset: boolean) => {
      if (!reset && inFlightPathsRef.current.has(directoryPath)) return;
      if (reset) inFlightPathsRef.current.clear();
      inFlightPathsRef.current.add(directoryPath);
      setLoadingDirectoryPaths((prev) => {
        const next = reset ? new Set<string>() : new Set(prev);
        next.add(directoryPath);
        return next;
      });
      if (reset) {
        setEntriesByPath({});
        setLoadedDirectoryPaths(new Set());
        setDirectoryErrors({});
        setLoading(true);
        setError(null);
      }

      try {
        const result = await client
          .query(SESSION_GROUP_DIRECTORY_ENTRIES_QUERY, {
            sessionGroupId,
            directoryPath,
            depth,
          })
          .toPromise();
        if (result.error) {
          throw new Error(result.error.message);
        }

        const entries = (result.data?.sessionGroupDirectoryEntries ?? []) as FileTreeEntry[];
        setEntriesByPath((prev) => mergeEntries(reset ? {} : prev, entries));
        setLoadedDirectoryPaths((prev) => {
          const next = reset ? new Set<string>() : new Set(prev);
          next.add(directoryPath);
          if (depth > 1) {
            for (const entry of entries) {
              if (entry.isDirectory && parentPath(entry.path) === directoryPath) {
                next.add(entry.path);
              }
            }
          }
          return next;
        });
        setDirectoryErrors((prev) => {
          const next = reset ? {} : { ...prev };
          delete next[directoryPath];
          return next;
        });
        if (reset) setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load directory";
        if (reset) {
          setError(message);
        } else {
          setDirectoryErrors((prev) => ({ ...prev, [directoryPath]: message }));
        }
      } finally {
        inFlightPathsRef.current.delete(directoryPath);
        setLoadingDirectoryPaths((prev) => {
          const next = new Set(prev);
          next.delete(directoryPath);
          return next;
        });
        if (reset) setLoading(false);
      }
    },
    [sessionGroupId],
  );

  const refreshTree = useCallback(async () => {
    inFlightPathsRef.current.clear();
    setLoading(true);
    setError(null);
    setEntriesByPath({});
    setLoadedDirectoryPaths(new Set());
    setDirectoryErrors({});

    try {
      const result = await client
        .query(SESSION_GROUP_FILE_TREE_QUERY, { sessionGroupId })
        .toPromise();
      if (result.error) {
        throw new Error(result.error.message);
      }
      const fileTree = result.data?.sessionGroupFileTree;
      // Repo too large for one recursive fetch: fall back to lazy depth-2 loading.
      if (fileTree?.truncated) {
        await loadDirectoryWithDepth("", 2, true);
        return;
      }
      const { entriesByPath: entries, directoryPaths } = entriesFromPaths(
        (fileTree?.paths ?? []) as string[],
      );
      setEntriesByPath(entries);
      setLoadedDirectoryPaths(directoryPaths);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
      setLoading(false);
    }
  }, [sessionGroupId, loadDirectoryWithDepth]);

  const loadDirectory = useCallback(
    (directoryPath: string) => loadDirectoryWithDepth(directoryPath, 1, false),
    [loadDirectoryWithDepth],
  );

  useEffect(() => {
    void refreshTree();
  }, [refreshTree]);

  const tree = useMemo(
    () =>
      buildTreeFromEntries(Object.values(entriesByPath), {
        loadedDirectoryPaths,
        loadingDirectoryPaths,
        directoryErrors,
      }),
    [directoryErrors, entriesByPath, loadedDirectoryPaths, loadingDirectoryPaths],
  );

  return {
    tree,
    loading,
    error,
    loadedDirectoryPaths,
    loadingDirectoryPaths,
    refreshTree,
    loadDirectory,
  };
}
