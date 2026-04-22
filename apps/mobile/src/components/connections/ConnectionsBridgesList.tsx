import { useCallback, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import {
  APPROVE_BRIDGE_ACCESS_REQUEST_MUTATION,
  DENY_BRIDGE_ACCESS_REQUEST_MUTATION,
  REVOKE_BRIDGE_ACCESS_GRANT_MUTATION,
} from "@trace/client-core";
import type { BridgeAccessCapability } from "@trace/gql";
import { EmptyState, Text } from "@/components/design-system";
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
  const { connections, loading, refresh } = useConnections();
  const [refreshing, setRefreshing] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

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

  const approveAllSessions = (request: ConnectionAccessRequest) => {
    void runAction(request.id, async () => {
      const result = await getClient()
        .mutation(APPROVE_BRIDGE_ACCESS_REQUEST_MUTATION, {
          requestId: request.id,
          scopeType: "all_sessions",
          sessionGroupId: null,
          expiresAt: null,
          capabilities: ["session"] as BridgeAccessCapability[],
        })
        .toPromise();
      if (result.error) throw result.error;
    });
  };

  const denyRequest = (request: ConnectionAccessRequest) => {
    void runAction(request.id, async () => {
      const result = await getClient()
        .mutation(DENY_BRIDGE_ACCESS_REQUEST_MUTATION, { requestId: request.id })
        .toPromise();
      if (result.error) throw result.error;
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
          });
        },
      },
    ]);
  };

  if (loading && connections.length === 0) {
    return <CenteredText text="Loading bridges..." />;
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
          onApprove={approveAllSessions}
          onDeny={denyRequest}
          onRevoke={revokeGrant}
          onRefresh={refresh}
        />
      ))}
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
