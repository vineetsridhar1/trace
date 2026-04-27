import { useCallback, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import {
  APPROVE_BRIDGE_ACCESS_REQUEST_MUTATION,
  DENY_BRIDGE_ACCESS_REQUEST_MUTATION,
  REQUEST_BRIDGE_ACCESS_MUTATION,
  REVOKE_BRIDGE_ACCESS_GRANT_MUTATION,
  UPDATE_BRIDGE_ACCESS_GRANT_MUTATION,
  useAuthStore,
} from "@trace/client-core";
import type { BridgeAccessCapability } from "@trace/gql";
import { EmptyState, Text } from "@/components/design-system";
import { ConnectionsBridgeAccessSheet } from "@/components/connections/ConnectionsBridgeAccessSheet";
import { ConnectionsBridgeSection } from "@/components/connections/ConnectionsBridgeSection";
import { getClient } from "@/lib/urql";
import { useTheme } from "@/theme";
import {
  useConnections,
  type ConnectionAccessGrant,
  type ConnectionAccessRequest,
} from "@/hooks/useConnections";

export function ConnectionsBridgesList() {
  const theme = useTheme();
  const { connections, loading, error, refresh } = useConnections();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<ConnectionAccessRequest | null>(null);
  const [selectedGrant, setSelectedGrant] = useState<ConnectionAccessGrant | null>(null);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const runAction = useCallback(
    async (id: string, perform: () => Promise<void>) => {
      setPendingActionId(id);
      try {
        await perform();
        await refresh();
      } catch (err) {
        Alert.alert("Action failed", err instanceof Error ? err.message : "Unknown error");
      } finally {
        setPendingActionId(null);
      }
    },
    [refresh],
  );

  const approveRequest = (input: {
    requestId: string;
    scopeType: "all_sessions" | "session_group";
    sessionGroupId?: string | null;
    expiresAt?: string;
    capabilities: BridgeAccessCapability[];
  }) => {
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
      setSelectedRequest(null);
    });
  };

  const denyRequest = (request: ConnectionAccessRequest) => {
    void runAction(request.id, async () => {
      const result = await getClient()
        .mutation(DENY_BRIDGE_ACCESS_REQUEST_MUTATION, { requestId: request.id })
        .toPromise();
      if (result.error) throw result.error;
      setSelectedRequest(null);
    });
  };

  const revokeGrant = (grant: ConnectionAccessGrant) => {
    const grantee = grant.granteeUser.name ?? grant.granteeUser.email ?? "this user";
    Alert.alert("Revoke access", `Revoke ${grantee}'s access?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Revoke",
        style: "destructive",
        onPress: () => {
          void runAction(grant.id, async () => {
            const result = await getClient()
              .mutation(REVOKE_BRIDGE_ACCESS_GRANT_MUTATION, { grantId: grant.id })
              .toPromise();
            if (result.error) throw result.error;
            setSelectedGrant(null);
          });
        },
      },
    ]);
  };

  const updateGrant = (grant: ConnectionAccessGrant, capabilities: BridgeAccessCapability[]) => {
    void runAction(grant.id, async () => {
      const result = await getClient()
        .mutation(UPDATE_BRIDGE_ACCESS_GRANT_MUTATION, {
          grantId: grant.id,
          capabilities,
        })
        .toPromise();
      if (result.error) throw result.error;
      setSelectedGrant(null);
    });
  };

  const requestBridgeAccess = (connectionId: string, runtimeInstanceId: string) => {
    void runAction(connectionId, async () => {
      const result = await getClient()
        .mutation(REQUEST_BRIDGE_ACCESS_MUTATION, {
          runtimeInstanceId,
          scopeType: "all_sessions",
          requestedCapabilities: ["session", "terminal"] satisfies BridgeAccessCapability[],
        })
        .toPromise();
      if (result.error) throw result.error;
    });
  };

  if (loading && connections.length === 0) {
    return <CenteredText text="Loading bridges..." />;
  }
  if (error && connections.length === 0) {
    return (
      <View style={styles.center}>
        <EmptyState
          icon="exclamationmark.triangle"
          title="Couldn't load bridges"
          subtitle={error}
          action={{ label: "Retry", onPress: () => void handleRefresh() }}
        />
      </View>
    );
  }
  if (connections.length === 0) {
    return (
      <View style={styles.center}>
        <EmptyState
          icon="bolt.horizontal"
          title="No bridges yet"
          subtitle="Run Trace Desktop to register a local bridge."
        />
      </View>
    );
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.content, { padding: theme.spacing.lg }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      {connections.map((connection) => (
        <ConnectionsBridgeSection
          key={connection.bridge.id}
          connection={connection}
          pendingActionId={pendingActionId}
          onReviewRequest={setSelectedRequest}
          onDeny={denyRequest}
          onManageGrant={setSelectedGrant}
          onRequestAccess={(connection) =>
            requestBridgeAccess(connection.bridge.id, connection.bridge.instanceId)
          }
          onRefresh={refresh}
          currentUserId={userId}
        />
      ))}
      <ConnectionsBridgeAccessSheet
        request={selectedRequest}
        grant={selectedGrant}
        visible={selectedRequest !== null || selectedGrant !== null}
        pending={pendingActionId !== null}
        onClose={() => {
          setSelectedRequest(null);
          setSelectedGrant(null);
        }}
        onApprove={approveRequest}
        onDeny={denyRequest}
        onRevoke={revokeGrant}
        onUpdate={updateGrant}
      />
    </ScrollView>
  );
}

function CenteredText({ text }: { text: string }) {
  return (
    <View style={styles.center}>
      <Text variant="footnote" color="mutedForeground">
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingBottom: 32 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
});
