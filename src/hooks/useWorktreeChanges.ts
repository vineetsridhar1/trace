import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorktreeDiffResult } from '../types';

const POLL_INTERVAL = 5000;

export function useWorktreeChanges(messageId: string | null, baseBranch: string = 'main') {
  const [diffData, setDiffData] = useState<WorktreeDiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDiff = useCallback(async () => {
    if (!messageId) return;
    setLoading(true);
    try {
      const result = await window.traceAPI.getWorktreeDiff(messageId, baseBranch);
      setDiffData(result);
    } catch {
      setDiffData(null);
    } finally {
      setLoading(false);
    }
  }, [messageId, baseBranch]);

  useEffect(() => {
    if (!messageId) return;

    void fetchDiff();
    intervalRef.current = setInterval(() => void fetchDiff(), POLL_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [messageId, fetchDiff]);

  return { diffData, loading, refresh: fetchDiff };
}
