import { useCallback, useState } from 'react';
import type { Workspace } from '../types';

interface UseWorktreeStateOptions {
  getChannelRepoPath: () => string;
  getChannelBaseBranch: () => string;
  selectedWorkspaceRef: React.RefObject<Workspace | null>;
}

export function useWorktreeState({
  getChannelRepoPath,
  getChannelBaseBranch,
  selectedWorkspaceRef,
}: UseWorktreeStateOptions) {
  const [hasWorktree, setHasWorktree] = useState<boolean | null>(null);
  const [deletingWorktree, setDeletingWorktree] = useState(false);
  const [mergingWorktree, setMergingWorktree] = useState(false);

  const checkWorktree = useCallback(
    async (workspaceId: string) => {
      if (
        !window.traceAPI ||
        typeof window.traceAPI.checkWorktreeExists !== 'function'
      ) {
        setHasWorktree(false);
        return;
      }
      try {
        const repoPath = getChannelRepoPath();
        const result = await window.traceAPI.checkWorktreeExists(workspaceId, repoPath);
        setHasWorktree(result.success && result.exists === true);
      } catch {
        setHasWorktree(false);
      }
    },
    [getChannelRepoPath],
  );

  const deleteWorktree = useCallback(
    async (onDeleted?: (workspaceId: string) => void) => {
      const workspace = selectedWorkspaceRef.current;
      if (!workspace) return;

      const confirmed = window.confirm(
        'Delete this worktree? This removes local files for this workspace.',
      );
      if (!confirmed) return;

      setDeletingWorktree(true);
      try {
        const repoPath = getChannelRepoPath();
        const result = await window.traceAPI.deleteWorktree(workspace.id, repoPath);
        if (!result.success) {
          console.error('Failed to delete worktree:', result.error);
          return;
        }
        setHasWorktree(false);
        onDeleted?.(workspace.id);
      } finally {
        setDeletingWorktree(false);
      }
    },
    [getChannelRepoPath, selectedWorkspaceRef],
  );

  const mergeWorktree = useCallback(async () => {
    const workspace = selectedWorkspaceRef.current;
    if (!workspace) return;

    const baseBranch = getChannelBaseBranch();
    const confirmed = window.confirm(
      `Merge this worktree branch into ${baseBranch}?`,
    );
    if (!confirmed) return;

    setMergingWorktree(true);
    try {
      const repoPath = getChannelRepoPath();
      const result = await window.traceAPI.mergeWorktree(workspace.id, repoPath, baseBranch);
      if (!result.success) {
        console.error('Failed to merge worktree:', result.error);
        return;
      }
    } finally {
      setMergingWorktree(false);
    }
  }, [getChannelBaseBranch, getChannelRepoPath, selectedWorkspaceRef]);

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
