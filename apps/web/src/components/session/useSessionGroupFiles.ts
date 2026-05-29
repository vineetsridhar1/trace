import { useCallback, useEffect, useState } from "react";
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

export function useSessionGroupFiles(sessionGroupId: string): SessionGroupFilesState {
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, [sessionGroupId]);

  useEffect(() => {
    setFiles([]);
    void refreshFiles();
  }, [refreshFiles]);

  return { files, loading, error, refreshFiles };
}
