import { useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import {
  APPROVE_BRIDGE_ACCESS_REQUEST_MUTATION,
  DENY_BRIDGE_ACCESS_REQUEST_MUTATION,
} from "@trace/client-core";
import type { BridgeAccessCapability } from "@trace/gql";
import { ConnectionsBridgeAccessRequestModal } from "@/components/connections/ConnectionsBridgeAccessRequestModal";
import { useConnections, type ConnectionAccessRequest } from "@/hooks/useConnections";
import { getClient } from "@/lib/urql";

export function GlobalBridgeAccessRequestPopup() {
  const { connections, refresh } = useConnections();
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [dismissedRequestIds, setDismissedRequestIds] = useState<Set<string>>(() => new Set());
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  const requests = useMemo(
    () => connections.flatMap((connection) => connection.bridge.accessRequests),
    [connections],
  );
  const activeRequest = requests.find((request) => request.id === activeRequestId) ?? null;

  useEffect(() => {
    if (activeRequestId && !activeRequest) {
      setActiveRequestId(null);
      return;
    }
    if (activeRequestId) return;

    const nextRequest = requests.find((request) => !dismissedRequestIds.has(request.id));
    if (nextRequest) setActiveRequestId(nextRequest.id);
  }, [activeRequest, activeRequestId, dismissedRequestIds, requests]);

  function closeRequest() {
    if (activeRequestId) {
      setDismissedRequestIds((current) => new Set(current).add(activeRequestId));
    }
    setActiveRequestId(null);
  }

  async function runAction(requestId: string, perform: () => Promise<void>) {
    setPendingActionId(requestId);
    try {
      await perform();
      setDismissedRequestIds((current) => new Set(current).add(requestId));
      setActiveRequestId(null);
      await refresh();
    } catch (err) {
      Alert.alert("Action failed", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setPendingActionId(null);
    }
  }

  function approveRequest(input: {
    requestId: string;
    scopeType: "all_sessions" | "session_group";
    sessionGroupId?: string | null;
    expiresAt?: string;
    capabilities: BridgeAccessCapability[];
  }) {
    void runAction(input.requestId, async () => {
      const result = await getClient()
        .mutation(APPROVE_BRIDGE_ACCESS_REQUEST_MUTATION, {
          requestId: input.requestId,
          scopeType: input.scopeType,
          sessionGroupId: input.sessionGroupId ?? null,
          expiresAt: input.expiresAt,
          capabilities: input.capabilities,
        })
        .toPromise();
      if (result.error) throw result.error;
    });
  }

  function denyRequest(request: ConnectionAccessRequest) {
    void runAction(request.id, async () => {
      const result = await getClient()
        .mutation(DENY_BRIDGE_ACCESS_REQUEST_MUTATION, { requestId: request.id })
        .toPromise();
      if (result.error) throw result.error;
    });
  }

  return (
    <ConnectionsBridgeAccessRequestModal
      request={activeRequest}
      visible={activeRequest !== null}
      pending={pendingActionId !== null}
      onClose={closeRequest}
      onApprove={approveRequest}
      onDeny={denyRequest}
    />
  );
}
