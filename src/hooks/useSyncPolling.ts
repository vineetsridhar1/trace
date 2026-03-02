import { useCallback, useEffect, useRef, useState } from 'react';
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
  persistPrUrl: (workspaceId: string, prUrl: string) => Promise<void>;
}

function getPRCandidates(workspaces: Workspace[]) {
  return workspaces.filter(
    (ws): ws is Workspace & { branch: string } =>
      (ws.status === 'completed' || ws.status === 'review' || ws.status === 'merged')
      && typeof ws.branch === 'string'
      && ws.branch.length > 0,
  );
}

export function useSyncPolling({
  workspacesRef,
  getChannelId,
  getRepoPath,
  getBaseBranch,
  updateWorkspaceStatus,
  persistPrUrl,
}: UseSyncPollingOptions) {
  const updateStatusRef = useRef(updateWorkspaceStatus);
  updateStatusRef.current = updateWorkspaceStatus;
  const persistPrUrlRef = useRef(persistPrUrl);
  persistPrUrlRef.current = persistPrUrl;

  const [ghAvailable, setGhAvailable] = useState<boolean | null>(null);
  const seenPrUrls = useRef<Map<string, string>>(new Map());

  const [executeCheckPRStatuses] = useCheckPrStatusesLazyQuery();

  // Check gh CLI availability on mount
  useEffect(() => {
    window.traceAPI.checkGhAuth().then((result) => {
      setGhAvailable(result.available);
    }).catch(() => {
      setGhAvailable(false);
    });
  }, []);

  // ─── Local gh CLI path ──────────────────────────────────────────
  const checkPRsLocal = useCallback(async () => {
    const repoPath = getRepoPath();
    if (!repoPath) return;

    const candidates = getPRCandidates(workspacesRef.current);
    if (candidates.length === 0) return;

    const branches = candidates.map((ws) => ws.branch);

    try {
      const result = await window.traceAPI.checkPRStatusesLocal(repoPath, branches);
      if (!result.success || !result.statuses) return;

      const statusMap = new Map(result.statuses.map((s) => [s.branch, s]));

      for (const ws of candidates) {
        const pr = statusMap.get(ws.branch);
        if (!pr) continue;

        // Persist prUrl when discovered (skip if unchanged)
        if (pr.prUrl && seenPrUrls.current.get(ws.id) !== pr.prUrl) {
          seenPrUrls.current.set(ws.id, pr.prUrl);
          void persistPrUrlRef.current(ws.id, pr.prUrl);
        }

        if (ws.status === 'completed' && pr.state === 'open') {
          await updateStatusRef.current(ws.id, 'review');
        } else if (ws.status === 'review' && pr.state === 'merged') {
          await updateStatusRef.current(ws.id, 'merged');
        } else if (ws.status === 'review' && (pr.state === 'closed' || pr.state === 'none')) {
          await updateStatusRef.current(ws.id, 'in_progress');
        }
      }
    } catch {
      // Silent failure — PR checking is best-effort
    }
  }, [workspacesRef, getRepoPath]);

  // ─── Server fallback path (polling via GitHub API) ──────────────
  const checkPRsServer = useCallback(async () => {
    const channelId = getChannelId();
    if (!channelId) return;

    const candidates = getPRCandidates(workspacesRef.current);
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
          await updateStatusRef.current(ws.id, 'in_progress');
        }
      }
    } catch {
      // Silent failure — PR polling is best-effort
    }
  }, [workspacesRef, getChannelId, executeCheckPRStatuses]);

  // ─── Unified tick ───────────────────────────────────────────────
  const tick = useCallback(async (silent = true) => {
    const repoPath = getRepoPath();
    const baseBranch = getBaseBranch();

    const prCheck = ghAvailable ? checkPRsLocal() : checkPRsServer();

    await Promise.allSettled([
      useSyncStore.getState().checkMainBranch(repoPath, baseBranch, silent),
      prCheck,
    ]);
  }, [getRepoPath, getBaseBranch, ghAvailable, checkPRsLocal, checkPRsServer]);

  useEffect(() => {
    // Wait for gh availability check to resolve
    if (ghAvailable === null) return;

    // Immediate check on mount (non-silent for main branch to show spinner)
    void tick(false);

    const interval = window.setInterval(() => {
      void tick();
    }, 30_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [tick, ghAvailable]);

  return { triggerSync: tick };
}
