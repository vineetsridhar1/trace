import { createElement, useCallback, useEffect } from "react";
import { toast } from "sonner";
import type { BridgeAccessCapability } from "@trace/gql";
import { client } from "../lib/urql";
import { MY_BRIDGE_RUNTIMES_QUERY } from "../lib/mutations";
import { useAuthStore } from "../stores/auth";
import { getBridgeAccessRequestToastId } from "../lib/bridge-access";
import {
  BridgeAccessRequestToast,
  type BridgeAccessRequestToastData,
} from "../notifications/BridgeAccessRequestToast";

type RequesterUser = {
  id: string;
  name?: string | null;
  avatarUrl?: string | null;
};

type AccessRequest = {
  id: string;
  scopeType: "all_sessions" | "session_group";
  requestedExpiresAt?: string | null;
  requestedCapabilities?: BridgeAccessCapability[];
  status: "pending" | "approved" | "denied";
  createdAt: string;
  requesterUser: RequesterUser;
  sessionGroup?: { id: string; name?: string | null } | null;
};

type BridgeRuntimeItem = {
  id: string;
  instanceId: string;
  label: string;
  ownerUser: { id: string };
  accessRequests: AccessRequest[];
};

/**
 * Hydrates bridge-access approval toasts on auth/load. After mount, live
 * updates come through the `bridge_access_requested` and
 * `bridge_access_request_resolved` event handlers in notifications/handlers.ts
 * — this hook only rebuilds missed toasts (app restart, log-in) and relies on
 * the handlers for subsequent request/resolve/revoke updates.
 */
export function useBridgePendingRequestToasts() {
  const userId = useAuthStore((s) => s.user?.id);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);

  const hydrate = useCallback(async () => {
    if (!userId || !activeOrgId) return;
    const result = (await client
      .query(MY_BRIDGE_RUNTIMES_QUERY, {}, { requestPolicy: "network-only" })
      .toPromise()) as { data?: { myBridgeRuntimes?: BridgeRuntimeItem[] } };
    const runtimes = result.data?.myBridgeRuntimes ?? [];
    for (const runtime of runtimes) {
      for (const request of runtime.accessRequests) {
        if (request.status !== "pending") continue;
        const data: BridgeAccessRequestToastData = {
          ownerUserId: runtime.ownerUser.id,
          requestId: request.id,
          runtimeInstanceId: runtime.instanceId,
          runtimeLabel: runtime.label,
          scopeType: request.scopeType,
          sessionGroup: request.sessionGroup
            ? { id: request.sessionGroup.id, name: request.sessionGroup.name ?? null }
            : null,
          requestedCapabilities: request.requestedCapabilities ?? [],
          requestedExpiresAt: request.requestedExpiresAt ?? null,
          createdAt: request.createdAt,
          status: "pending",
          requesterUser: {
            id: request.requesterUser.id,
            name: request.requesterUser.name ?? null,
            avatarUrl: request.requesterUser.avatarUrl ?? null,
          },
          grant: null,
        };
        const toastId = getBridgeAccessRequestToastId(request.id);
        toast.custom(() => createElement(BridgeAccessRequestToast, { toastId, request: data }), {
          id: toastId,
          duration: Infinity,
        });
      }
    }
  }, [userId, activeOrgId]);

  useEffect(() => {
    if (!userId || !activeOrgId) return;
    void hydrate();
    // Re-hydrate when the tab regains visibility — covers events missed while
    // the subscription was disconnected (sleep, network drop).
    function onVisible() {
      if (!document.hidden) void hydrate();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [userId, activeOrgId, hydrate]);
}
