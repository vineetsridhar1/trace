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
  const repoPath = getRepoPath();
  const baseBranch = getBaseBranch();

  const checkMerged = useCallback(async () => {
    const repoPath = getRepoPath();
    const baseBranch = getBaseBranch();
    if (!repoPath) return;

    const messages = messagesRef.current;
    const candidates = messages.filter(
      (m): m is ChannelMessage & { branch: string } =>
        m.status === 'completed'
        && typeof m.branch === 'string'
        && m.branch.length > 0,
    );
    if (candidates.length === 0) return;

    const targets = candidates.map((m) => ({
      messageId: m.id,
      branch: m.branch,
    }));
    try {
      const result = await window.traceAPI.checkBranchesMerged(
        repoPath,
        targets,
        baseBranch,
      );
      if (!result.success) return;

      for (const msg of candidates) {
        const isMerged = result.merged[msg.id] === true;
        if (msg.status === 'completed' && isMerged) {
          await updateStatusRef.current(msg.id, 'merged');
        }
        // Never flip merged → completed; merged is a terminal state.
      }
    } catch {
      // Silent failure
    }
  }, [messagesRef, getRepoPath, getBaseBranch]);

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
