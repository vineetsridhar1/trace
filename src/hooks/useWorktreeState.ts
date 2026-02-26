import { useCallback, useState } from 'react';
import type { ChannelMessage } from '../types';

interface UseWorktreeStateOptions {
  getChannelRepoPath: () => string;
  getChannelBaseBranch: () => string;
  selectedMessageRef: React.RefObject<ChannelMessage | null>;
}

export function useWorktreeState({
  getChannelRepoPath,
  getChannelBaseBranch,
  selectedMessageRef,
}: UseWorktreeStateOptions) {
  const [hasWorktree, setHasWorktree] = useState<boolean | null>(null);
  const [deletingWorktree, setDeletingWorktree] = useState(false);
  const [mergingWorktree, setMergingWorktree] = useState(false);

  const checkWorktree = useCallback(
    async (messageId: string) => {
      if (
        !window.traceAPI ||
        typeof window.traceAPI.checkWorktreeExists !== 'function'
      ) {
        setHasWorktree(false);
        return;
      }
      try {
        const repoPath = getChannelRepoPath();
        const result = await window.traceAPI.checkWorktreeExists(messageId, repoPath);
        setHasWorktree(result.success && result.exists === true);
      } catch {
        setHasWorktree(false);
      }
    },
    [getChannelRepoPath],
  );

  const deleteWorktree = useCallback(
    async (onDeleted?: (messageId: string) => void) => {
      const message = selectedMessageRef.current;
      if (!message) return;

      const confirmed = window.confirm(
        'Delete this worktree? This removes local files for this workspace.',
      );
      if (!confirmed) return;

      setDeletingWorktree(true);
      try {
        const repoPath = getChannelRepoPath();
        const result = await window.traceAPI.deleteWorktree(message.id, repoPath);
        if (!result.success) {
          console.error('Failed to delete worktree:', result.error);
          return;
        }
        console.log(
          result.removed
            ? `Deleted worktree: ${result.worktreePath}`
            : `Worktree already missing: ${result.worktreePath}`,
        );
        setHasWorktree(false);
        onDeleted?.(message.id);
      } finally {
        setDeletingWorktree(false);
      }
    },
    [getChannelRepoPath, selectedMessageRef],
  );

  const mergeWorktree = useCallback(async () => {
    const message = selectedMessageRef.current;
    if (!message) return;

    const baseBranch = getChannelBaseBranch();
    const confirmed = window.confirm(
      `Merge this worktree branch into ${baseBranch}?`,
    );
    if (!confirmed) return;

    setMergingWorktree(true);
    try {
      const repoPath = getChannelRepoPath();
      const result = await window.traceAPI.mergeWorktree(message.id, repoPath, baseBranch);
      if (!result.success) {
        console.error('Failed to merge worktree:', result.error);
        return;
      }
      console.log(`Merged branch ${result.branch} into ${baseBranch}`);
    } finally {
      setMergingWorktree(false);
    }
  }, [getChannelBaseBranch, getChannelRepoPath, selectedMessageRef]);

  return {
    hasWorktree,
    setHasWorktree,
    deletingWorktree,
    mergingWorktree,
    checkWorktree,
    deleteWorktree,
    mergeWorktree,
  };
}
