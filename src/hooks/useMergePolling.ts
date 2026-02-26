import { useCallback, useEffect, useRef } from 'react';
import type { ChannelMessage, TicketStatus } from '../types';

interface UseMergePollingOptions {
  messagesRef: React.RefObject<ChannelMessage[]>;
  repoPath: string;
  baseBranch: string;
  updateMessageStatus: (messageId: string, status: TicketStatus) => Promise<void>;
}

export function useMergePolling({
  messagesRef,
  repoPath,
  baseBranch,
  updateMessageStatus,
}: UseMergePollingOptions) {
  const updateStatusRef = useRef(updateMessageStatus);
  updateStatusRef.current = updateMessageStatus;

  const repoPathRef = useRef(repoPath);
  repoPathRef.current = repoPath;

  const baseBranchRef = useRef(baseBranch);
  baseBranchRef.current = baseBranch;

  const checkMerged = useCallback(async () => {
    const currentRepoPath = repoPathRef.current;
    if (!currentRepoPath) return;

    const messages = messagesRef.current;
    const completed = messages.filter(
      (m) => m.status === 'completed' && m.branch,
    );
    if (completed.length === 0) return;

    const branches = completed.map((m) => m.branch!);
    try {
      const result = await window.traceAPI.checkBranchesMerged(
        currentRepoPath,
        branches,
        baseBranchRef.current,
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
  }, [messagesRef]);

  useEffect(() => {
    if (!repoPath) return;

    // Run once on startup
    void checkMerged();

    // Start watching git refs for base branch changes
    void window.traceAPI.watchBaseBranch(repoPath, baseBranch);

    // Re-check when the base branch ref changes on disk
    const unsubscribe = window.traceAPI.onBaseBranchChanged(() => {
      void checkMerged();
    });

    return () => {
      unsubscribe();
      void window.traceAPI.unwatchBaseBranch();
    };
  }, [checkMerged, repoPath, baseBranch]);

  return { triggerCheck: checkMerged };
}
