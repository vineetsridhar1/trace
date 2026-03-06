import { useCallback, useEffect, useRef, useState } from "react";
import { useWorktreeRelay } from "./relay/useWorktreeRelay";
import type { GetWorktreeDiffResult } from "./relay/types";

const POLL_INTERVAL = 10000;

export function useWorktreeChanges(
  workspaceId: string | null,
  baseBranch = "main",
  enabled = true,
) {
  const [diffData, setDiffData] = useState<GetWorktreeDiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { getWorktreeDiff } = useWorktreeRelay();

  const fetchDiff = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const result = await getWorktreeDiff({ workspaceId, baseBranch });
      setDiffData(result.success && result.data ? result.data : null);
    } catch {
      setDiffData(null);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, baseBranch, getWorktreeDiff]);

  useEffect(() => {
    if (!workspaceId || !enabled) return;

    void fetchDiff();
    intervalRef.current = setInterval(() => void fetchDiff(), POLL_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [workspaceId, enabled, fetchDiff]);

  return { diffData, loading, refresh: fetchDiff };
}
