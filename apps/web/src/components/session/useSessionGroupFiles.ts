import { useCallback, useEffect, useRef, useState } from "react";
import { gql } from "@urql/core";
import { client } from "../../lib/urql";

const SESSION_GROUP_FILES_QUERY = gql`
  query SessionGroupFiles($sessionGroupId: ID!) {
    sessionGroupFiles(sessionGroupId: $sessionGroupId)
  }
`;

export interface SessionGroupFilesState {
  files: string[];
  loading: boolean;
  error: string | null;
  refreshFiles: () => Promise<void>;
}

export function useSessionGroupFiles(
  sessionGroupId: string,
  enabled = true,
): SessionGroupFilesState {
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedGroupRef = useRef<string | null>(null);

  const refreshFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.query(SESSION_GROUP_FILES_QUERY, { sessionGroupId }).toPromise();
      if (result.error) {
        setError(result.error.message);
        return;
      }
      setFiles(result.data?.sessionGroupFiles ?? []);
      loadedGroupRef.current = sessionGroupId;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, [sessionGroupId]);

  // Fetch lazily: only once enabled (e.g. the file palette opens) and not already
  // loaded for this group. Avoids an eager recursive GitHub tree fetch on every mount.
  useEffect(() => {
    if (!enabled) return;
    if (loadedGroupRef.current === sessionGroupId) return;
    setFiles([]);
    void refreshFiles();
  }, [enabled, sessionGroupId, refreshFiles]);

  return { files, loading, error, refreshFiles };
}
