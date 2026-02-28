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

  const checkImpl = useCallback(async (silent: boolean) => {
    if (!repoPath) return;
    if (!silent) setIsChecking(true);
    try {
      const result = await window.traceAPI.checkMainStatus(repoPath, branch);
      if (result.success) {
        setIsUpToDate(result.isUpToDate ?? null);
        setCommitsBehind(result.commitsBehind ?? 0);
        setError(null);
      } else {
        setIsUpToDate(null);
        setError(result.error ?? 'Failed to check status');
      }
    } catch (err) {
      setIsUpToDate(null);
      setError(String(err));
    } finally {
      if (!silent) setIsChecking(false);
    }
  }, [repoPath, branch]);

  const check = useCallback(() => checkImpl(false), [checkImpl]);

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

  // Check on mount and poll every 30 seconds (silent to avoid spinner flash)
  useEffect(() => {
    if (!repoPath) return;
    void checkImpl(false);
    const interval = setInterval(() => void checkImpl(true), 30_000);
    return () => clearInterval(interval);
  }, [checkImpl, repoPath]);

  return { isChecking, isPulling, isUpToDate, commitsBehind, error, check, pull };
}
