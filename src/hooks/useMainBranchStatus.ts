import { useCallback, useEffect, useState } from 'react';

interface MainBranchStatus {
  isChecking: boolean;
  isPulling: boolean;
  isUpToDate: boolean | null;
  commitsBehind: number;
  error: string | null;
  check: () => Promise<void>;
  pull: () => Promise<void>;
}

export function useMainBranchStatus(repoPath: string | null | undefined, baseBranch: string | null | undefined): MainBranchStatus {
  const [isChecking, setIsChecking] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isUpToDate, setIsUpToDate] = useState<boolean | null>(null);
  const [commitsBehind, setCommitsBehind] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const branch = baseBranch || 'main';

  const check = useCallback(async () => {
    if (!repoPath) return;
    setIsChecking(true);
    setError(null);
    try {
      const result = await window.traceAPI.checkMainStatus(repoPath, branch);
      if (result.success) {
        setIsUpToDate(result.isUpToDate ?? null);
        setCommitsBehind(result.commitsBehind ?? 0);
      } else {
        setError(result.error ?? 'Failed to check status');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsChecking(false);
    }
  }, [repoPath, branch]);

  const pull = useCallback(async () => {
    if (!repoPath) return;
    setIsPulling(true);
    setError(null);
    try {
      const result = await window.traceAPI.pullMain(repoPath, branch);
      if (result.success) {
        setIsUpToDate(true);
        setCommitsBehind(0);
      } else {
        setError(result.error ?? 'Failed to pull');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsPulling(false);
    }
  }, [repoPath, branch]);

  // Check on mount and poll every 30 seconds
  useEffect(() => {
    if (!repoPath) return;
    void check();
    const interval = setInterval(() => void check(), 30_000);
    return () => clearInterval(interval);
  }, [check, repoPath]);

  return { isChecking, isPulling, isUpToDate, commitsBehind, error, check, pull };
}
