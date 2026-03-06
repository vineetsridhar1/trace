import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorktreeDiffResult } from '../types';

const POLL_INTERVAL = 10000;

export function useWorktreeChanges(workspaceId: string | null, baseBranch = 'main', enabled = true) {
  const [diffData, setDiffData] = useState<WorktreeDiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDiff = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const result = await window.traceAPI.getWorktreeDiff(workspaceId, baseBranch);
      setDiffData(result);
    } catch {
      setDiffData(null);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, baseBranch]);

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
