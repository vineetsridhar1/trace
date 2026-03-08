import { useEffect, useRef } from "react";
import type { Workspace, TicketStatus } from "../types";
import { useAgentRunStore } from "../stores/agentRunStore";

const ACTIVE_STATUSES: TicketStatus[] = ["in_progress", "creation"];
const STARTUP_GRACE_MS = 5_000;
const POLL_INTERVAL_MS = 60_000;

function targetStatus(current: TicketStatus): TicketStatus {
  return current === "creation" ? "pending" : "completed";
}

export function useStuckWorkspaceReconciliation({
  workspaces,
  workspacesLoading,
  updateWorkspaceStatus,
}: {
  workspaces: Workspace[];
  workspacesLoading: boolean;
  updateWorkspaceStatus: (workspaceId: string, status: TicketStatus) => Promise<void>;
}) {
  const workspacesRef = useRef(workspaces);
  workspacesRef.current = workspaces;

  const updateRef = useRef(updateWorkspaceStatus);
  updateRef.current = updateWorkspaceStatus;

  // Track whether we've done the initial startup reconciliation so we can
  // apply the grace period only on the very first check.
  const startupDoneRef = useRef(false);

  useEffect(() => {
    if (workspacesLoading || !window.traceAPI?.checkRunningProcesses) return;

    async function reconcile() {
      const stuck = workspacesRef.current.filter((ws) =>
        ACTIVE_STATUSES.includes(ws.status),
      );
      if (stuck.length === 0) return;

      const result = await window.traceAPI.checkRunningProcesses(
        stuck.map((ws) => ws.id),
      );
      if (!result.success) return;

      const runningSet = new Set(result.running);

      for (const ws of stuck) {
        if (!runningSet.has(ws.id)) {
          const newStatus = targetStatus(ws.status);
          console.warn(
            `[reconciliation] Workspace ${ws.id} stuck in "${ws.status}" with no running process — transitioning to "${newStatus}"`,
          );
          await updateRef.current(ws.id, newStatus);
          useAgentRunStore.getState().clearActiveRun(ws.id);
          useAgentRunStore.getState().removeSpawnedWorkspace(ws.id);
        }
      }
    }

    // On first mount, wait a grace period for processes to spin up before
    // checking. On subsequent activations (channel switch, WS reconnection)
    // run immediately — processes should already be registered by then.
    const initialDelay = startupDoneRef.current ? 0 : STARTUP_GRACE_MS;
    startupDoneRef.current = true;

    const startupTimer = setTimeout(reconcile, initialDelay);
    const interval = setInterval(reconcile, POLL_INTERVAL_MS);

    return () => {
      clearTimeout(startupTimer);
      clearInterval(interval);
    };
  }, [workspacesLoading]);
}
