import { useCallback, useEffect, useRef, useState } from 'react';
import { gql } from '@apollo/client';
import type { Workspace, TicketStatus } from '../types';
import { useCheckPrStatusesLazyQuery } from './__generated__/usePRPolling.generated';

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

interface UsePRPollingOptions {
  workspacesRef: React.RefObject<Workspace[]>;
  getChannelId: () => string | null;
  updateWorkspaceStatus: (workspaceId: string, status: TicketStatus) => Promise<void>;
}

export function usePRPolling({
  workspacesRef,
  getChannelId,
  updateWorkspaceStatus,
}: UsePRPollingOptions) {
  const updateStatusRef = useRef(updateWorkspaceStatus);
  updateStatusRef.current = updateWorkspaceStatus;

  const [prUrlMap, setPrUrlMap] = useState<Record<string, string>>({});
  const [executeCheckPRStatuses] = useCheckPrStatusesLazyQuery();

  const checkPRs = useCallback(async () => {
    const channelId = getChannelId();
    if (!channelId) return;

    const workspaces = workspacesRef.current;
    const candidates = workspaces.filter(
      (ws): ws is Workspace & { branch: string } =>
        (ws.status === 'completed' || ws.status === 'review')
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

      const newUrls: Record<string, string> = {};
      for (const ws of candidates) {
        const pr = prMap.get(ws.branch);
        if (!pr) continue;

        if (pr.prUrl) {
          newUrls[ws.id] = pr.prUrl;
        }

        if (ws.status === 'completed' && pr.hasPR) {
          await updateStatusRef.current(ws.id, 'review');
        } else if (ws.status === 'review' && pr.merged) {
          await updateStatusRef.current(ws.id, 'merged');
        } else if (ws.status === 'review' && !pr.hasPR) {
          await updateStatusRef.current(ws.id, 'completed');
        }
      }
      setPrUrlMap((prev) => ({ ...prev, ...newUrls }));
    } catch {
      // Silent failure — PR polling is best-effort
    }
  }, [workspacesRef, getChannelId, executeCheckPRStatuses]);

  useEffect(() => {
    void checkPRs();

    const interval = window.setInterval(() => {
      void checkPRs();
    }, 30_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [checkPRs]);

  return { triggerCheck: checkPRs, prUrlMap };
}
