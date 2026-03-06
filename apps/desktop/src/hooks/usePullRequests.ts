import { useCallback, useEffect, useState } from 'react';
import type { PullRequest } from '../types';

export function usePullRequests(repoPath: string | null) {
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPRs = useCallback(async () => {
    if (!repoPath) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.traceAPI.listPullRequests(repoPath);
      if (result.success && result.pullRequests) {
        setPullRequests(result.pullRequests);
      } else {
        setError(result.error ?? 'Failed to fetch pull requests');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [repoPath]);

  useEffect(() => {
    if (repoPath) void fetchPRs();
  }, [repoPath, fetchPRs]);

  return { pullRequests, loading, error, refresh: fetchPRs };
}
