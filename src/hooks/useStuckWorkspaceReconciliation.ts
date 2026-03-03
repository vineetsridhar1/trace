import { useEffect, useRef } from "react";
import type { Workspace, TicketStatus } from "../types";

const ACTIVE_STATUSES: TicketStatus[] = ["in_progress", "creation", "needs_input"];
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

  const reconciledRef = useRef(false);

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
        }
      }
    }

    // On first load, wait for the grace period before reconciling
    if (!reconciledRef.current) {
      reconciledRef.current = true;
      const startupTimer = setTimeout(reconcile, STARTUP_GRACE_MS);
      // Also start the periodic check
      const interval = setInterval(reconcile, POLL_INTERVAL_MS);
      return () => {
        clearTimeout(startupTimer);
        clearInterval(interval);
      };
    }
  }, [workspacesLoading]);
}
