import { useCallback, useEffect, useRef, useState } from "react";
import { useGitHubRelay } from "./relay/useGitHubRelay";
import type { PRStatus } from "./relay/types";

const POLL_INTERVAL = 30000;

export function usePRStatus(repoPath: string | null, branches: string[]) {
  const [statuses, setStatuses] = useState<PRStatus[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const branchesRef = useRef(branches);
  const { checkPRStatusesLocal } = useGitHubRelay();

  // Track branches by value, not reference
  const branchesKey = branches.join("\0");
  useEffect(() => {
    branchesRef.current = branches;
  }, [branchesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchStatuses = useCallback(async () => {
    if (!repoPath || branchesRef.current.length === 0) return;
    try {
      const result = await checkPRStatusesLocal({ repoPath, branches: branchesRef.current });
      if (result.success && result.data?.statuses) {
        setStatuses(result.data.statuses);
      }
    } catch {
      // Silently fail - PR status is non-critical
    }
  }, [repoPath, checkPRStatusesLocal]);

  useEffect(() => {
    if (!repoPath || branchesRef.current.length === 0) return;

    void fetchStatuses();
    intervalRef.current = setInterval(() => {
      if (document.hidden) return;
      void fetchStatuses();
    }, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [repoPath, branchesKey, fetchStatuses]); // eslint-disable-line react-hooks/exhaustive-deps

  return { statuses };
}
