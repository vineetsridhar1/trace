import { useCallback, useEffect, useRef } from 'react';
import type { Workspace, TicketStatus } from '../types';

interface UseMergePollingOptions {
  workspacesRef: React.RefObject<Workspace[]>;
  getRepoPath: () => string;
  getBaseBranch: () => string;
  updateWorkspaceStatus: (workspaceId: string, status: TicketStatus) => Promise<void>;
}

export function useMergePolling({
  workspacesRef,
  getRepoPath,
  getBaseBranch,
  updateWorkspaceStatus,
}: UseMergePollingOptions) {
  const updateStatusRef = useRef(updateWorkspaceStatus);
  updateStatusRef.current = updateWorkspaceStatus;
  const repoPath = getRepoPath();
  const baseBranch = getBaseBranch();

  const checkMerged = useCallback(async () => {
    const repoPath = getRepoPath();
    const baseBranch = getBaseBranch();
    if (!repoPath) return;

    const workspaces = workspacesRef.current;
    const candidates = workspaces.filter(
      (m): m is Workspace & { branch: string } =>
        m.status === 'completed'
        && typeof m.branch === 'string'
        && m.branch.length > 0,
    );
    if (candidates.length === 0) return;

    const targets = candidates.map((m) => ({
      workspaceId: m.id,
      branch: m.branch,
    }));

    try {
      const result = await window.traceAPI.checkBranchesMerged(repoPath, targets, baseBranch);
      if (!result.success) return;

      for (const ws of candidates) {
        if (ws.status === 'completed' && result.merged[ws.id] === true) {
          await updateStatusRef.current(ws.id, 'merged');
        }
      }
    } catch {
      // Silent failure
    }
  }, [workspacesRef, getRepoPath, getBaseBranch]);

  useEffect(() => {
    // Run once on mount
    void checkMerged();

    // Start watching git refs for base branch changes
    if (repoPath) {
      void window.traceAPI.watchBaseBranch(repoPath, baseBranch);
    }

    // Re-check when the base branch ref changes on disk
    const unsubscribe = window.traceAPI.onBaseBranchChanged(() => {
      void checkMerged();
    });
    const interval = window.setInterval(() => {
      void checkMerged();
    }, 30_000);

    return () => {
      unsubscribe();
      window.clearInterval(interval);
      void window.traceAPI.unwatchBaseBranch();
    };
  }, [checkMerged, repoPath, baseBranch]);

  return { triggerCheck: checkMerged };
}
