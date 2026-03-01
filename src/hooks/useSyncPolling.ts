import { useCallback, useEffect, useRef } from 'react';
import { gql } from '@apollo/client';
import type { Workspace, TicketStatus } from '../types';
import { useCheckPrStatusesLazyQuery } from './__generated__/useSyncPolling.generated';
import { useSyncStore } from '../stores/syncStore';

const GQL_CHECK_PR_STATUSES = gql`
  query CheckPRStatuses($channelId: ID!, $branches: [String!]!) {
    checkPRStatuses(channelId: $channelId, branches: $branches) {
      branch
      hasPR
      merged
      prUrl
    }
  }
`;

interface UseSyncPollingOptions {
  workspacesRef: React.RefObject<Workspace[]>;
  getChannelId: () => string | null;
  getRepoPath: () => string;
  getBaseBranch: () => string;
  updateWorkspaceStatus: (workspaceId: string, status: TicketStatus) => Promise<void>;
}

export function useSyncPolling({
  workspacesRef,
  getChannelId,
  getRepoPath,
  getBaseBranch,
  updateWorkspaceStatus,
}: UseSyncPollingOptions) {
  const updateStatusRef = useRef(updateWorkspaceStatus);
  updateStatusRef.current = updateWorkspaceStatus;

  const [executeCheckPRStatuses] = useCheckPrStatusesLazyQuery();

  const checkPRs = useCallback(async () => {
    const channelId = getChannelId();
    if (!channelId) return;

    const workspaces = workspacesRef.current;
    const candidates = workspaces.filter(
      (ws): ws is Workspace & { branch: string } =>
        (ws.status === 'completed' || ws.status === 'review' || ws.status === 'merged')
        && typeof ws.branch === 'string'
        && ws.branch.length > 0,
    );
    if (candidates.length === 0) return;

    const branches = candidates.map((ws) => ws.branch);

    try {
      const { data } = await executeCheckPRStatuses({
        variables: { channelId, branches },
        fetchPolicy: 'network-only',
      });
      if (!data?.checkPRStatuses) return;

      const prMap = new Map(data.checkPRStatuses.map((pr) => [pr.branch, pr]));

      for (const ws of candidates) {
        const pr = prMap.get(ws.branch);
        if (!pr) continue;

        if (ws.status === 'completed' && pr.hasPR) {
          await updateStatusRef.current(ws.id, 'review');
        } else if (ws.status === 'review' && pr.merged) {
          await updateStatusRef.current(ws.id, 'merged');
        } else if (ws.status === 'review' && !pr.hasPR) {
          await updateStatusRef.current(ws.id, 'completed');
        }
      }
    } catch {
      // Silent failure — PR polling is best-effort
    }
  }, [workspacesRef, getChannelId, executeCheckPRStatuses]);

  const tick = useCallback(async (silent = true) => {
    const repoPath = getRepoPath();
    const baseBranch = getBaseBranch();

    await Promise.allSettled([
      useSyncStore.getState().checkMainBranch(repoPath, baseBranch, silent),
      checkPRs(),
    ]);
  }, [getRepoPath, getBaseBranch, checkPRs]);

  useEffect(() => {
    // Immediate check on mount (non-silent for main branch to show spinner)
    void tick(false);

    const interval = window.setInterval(() => {
      void tick();
    }, 30_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [tick]);

  return { triggerSync: tick };
}
