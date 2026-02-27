import { useCallback, useEffect, useRef } from 'react';
import type { ChannelMessage, TicketStatus } from '../types';

interface UseMergePollingOptions {
  messagesRef: React.RefObject<ChannelMessage[]>;
  getRepoPath: () => string;
  getBaseBranch: () => string;
  updateMessageStatus: (messageId: string, status: TicketStatus) => Promise<void>;
}

export function useMergePolling({
  messagesRef,
  getRepoPath,
  getBaseBranch,
  updateMessageStatus,
}: UseMergePollingOptions) {
  const updateStatusRef = useRef(updateMessageStatus);
  updateStatusRef.current = updateMessageStatus;

  const checkMerged = useCallback(async () => {
    const repoPath = getRepoPath();
    const baseBranch = getBaseBranch();
    if (!repoPath) return;

    const messages = messagesRef.current;
    const completed = messages.filter(
      (m) => m.status === 'completed' && m.branch,
    );
    if (completed.length === 0) return;

    const branches = completed.map((m) => m.branch!);
    try {
      const result = await window.traceAPI.checkBranchesMerged(
        repoPath,
        branches,
        baseBranch,
      );
      if (!result.success) return;

      for (const msg of completed) {
        if (result.merged[msg.branch!]) {
          await updateStatusRef.current(msg.id, 'merged');
        }
      }
    } catch {
      // Silent failure
    }
  }, [messagesRef, getRepoPath, getBaseBranch]);

  useEffect(() => {
    // Run once on mount
    void checkMerged();

    // Start watching git refs for base branch changes
    const repoPath = getRepoPath();
    const baseBranch = getBaseBranch();
    if (repoPath) {
      void window.traceAPI.watchBaseBranch(repoPath, baseBranch);
    }

    // Re-check when the base branch ref changes on disk
    const unsubscribe = window.traceAPI.onBaseBranchChanged(() => {
      void checkMerged();
    });

    return () => {
      unsubscribe();
      void window.traceAPI.unwatchBaseBranch();
    };
  }, [checkMerged, getRepoPath, getBaseBranch]);

  return { triggerCheck: checkMerged };
}
