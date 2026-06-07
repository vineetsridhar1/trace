import { useEffect } from "react";
import { useAuthStore, useEntityStore, type AuthState } from "@trace/client-core";
import type { SessionEndpoints } from "@trace/gql";
import { handleUnauthorized, isUnauthorized } from "@/lib/auth";
import { getClient } from "@/lib/urql";
import { SESSION_PORTS_SUBSCRIPTION } from "./session-events-gql";

export function useSessionPorts(sessionId: string | null | undefined, enabled = true): void {
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);

  useEffect(() => {
    if (!enabled || !sessionId || !activeOrgId) return;

    const sub = getClient()
      .subscription(SESSION_PORTS_SUBSCRIPTION, { sessionId, organizationId: activeOrgId })
      .subscribe((result: { error?: unknown; data?: { sessionPortsChanged?: SessionEndpoints } }) => {
        if (isUnauthorized(result.error)) {
          void handleUnauthorized();
          return;
        }
        if (result.error) {
          console.error("[sessionPortsChanged] subscription error:", result.error);
          return;
        }
        const endpoints = result.data?.sessionPortsChanged;
        if (!endpoints) return;
        useEntityStore.getState().patch("sessions", sessionId, { endpoints });
      });

    return () => sub.unsubscribe();
  }, [activeOrgId, enabled, sessionId]);
}
