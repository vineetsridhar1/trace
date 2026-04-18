import { createElement, useEffect } from "react";
import { toast } from "sonner";
import { client } from "../lib/urql";
import { MY_BRIDGE_RUNTIMES_QUERY } from "../lib/mutations";
import { useAuthStore } from "../stores/auth";
import { useUIStore } from "../stores/ui";
import { getBridgeAccessRequestToastId } from "../lib/bridge-access";
import {
  BridgeAccessRequestToast,
  type BridgeAccessRequestToastData,
} from "../notifications/BridgeAccessRequestToast";

type RequesterUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
};

type AccessRequest = {
  id: string;
  scopeType: "all_sessions" | "session_group";
  requestedExpiresAt?: string | null;
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

export function useBridgePendingRequestToasts() {
  const userId = useAuthStore((s) => s.user?.id);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const refreshTick = useUIStore((s: { refreshTick: number }) => s.refreshTick);

  useEffect(() => {
    if (!userId || !activeOrgId) return;
    let cancelled = false;

    void client
      .query(MY_BRIDGE_RUNTIMES_QUERY, {}, { requestPolicy: "network-only" })
      .toPromise()
      .then((result: { data?: { myBridgeRuntimes?: BridgeRuntimeItem[] } }) => {
        if (cancelled) return;
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
                ? {
                    id: request.sessionGroup.id,
                    name: request.sessionGroup.name ?? null,
                  }
                : null,
              requestedExpiresAt: request.requestedExpiresAt ?? null,
              createdAt: request.createdAt,
              status: "pending",
              requesterUser: {
                id: request.requesterUser.id,
                name: request.requesterUser.name ?? null,
                email: request.requesterUser.email ?? null,
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
      });

    return () => {
      cancelled = true;
    };
  }, [userId, activeOrgId, refreshTick]);
}
