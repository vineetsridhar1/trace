import { useCallback, useEffect, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import {
  APPROVE_BRIDGE_ACCESS_REQUEST_MUTATION,
  DENY_BRIDGE_ACCESS_REQUEST_MUTATION,
  MY_BRIDGE_RUNTIMES_QUERY,
  REVOKE_BRIDGE_ACCESS_GRANT_MUTATION,
} from "@trace/client-core";
import type { BridgeAccessCapability, HostingMode } from "@trace/gql";
import {
  Button,
  EmptyState,
  ListRow,
  StatusDot,
  Text,
} from "@/components/design-system";
import { getClient } from "@/lib/urql";
import { useTheme } from "@/theme";

interface BridgeUser {
  id: string;
  name?: string | null;
  email?: string | null;
}

interface BridgeAccessRequest {
  id: string;
  scopeType: "all_sessions" | "session_group";
  requestedExpiresAt?: string | null;
  requestedCapabilities?: BridgeAccessCapability[] | null;
  status: "pending" | "approved" | "denied";
  createdAt: string;
  requesterUser: BridgeUser;
  sessionGroup?: { id: string; name?: string | null } | null;
}

interface BridgeAccessGrant {
  id: string;
  scopeType: "all_sessions" | "session_group";
  capabilities?: BridgeAccessCapability[] | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  granteeUser: BridgeUser;
  sessionGroup?: { id: string; name?: string | null } | null;
}

interface BridgeRuntimeItem {
  id: string;
  instanceId: string;
  label: string;
  hostingMode: HostingMode;
  lastSeenAt: string;
  connected: boolean;
  ownerUser: BridgeUser;
  accessRequests: BridgeAccessRequest[];
  accessGrants: BridgeAccessGrant[];
}

interface BridgesQueryResult {
  myBridgeRuntimes?: BridgeRuntimeItem[];
}

function userLabel(u: BridgeUser): string {
  return u.name ?? u.email ?? "Unknown user";
}

function describeScope(
  scopeType: "all_sessions" | "session_group",
  sessionGroup?: { name?: string | null } | null,
): string {
  if (scopeType === "session_group") {
    return sessionGroup?.name ? `Workspace: ${sessionGroup.name}` : "Single workspace";
  }
  return "All sessions";
}

export function ConnectionsBridgesList() {
  const theme = useTheme();
  const [bridges, setBridges] = useState<BridgeRuntimeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  const fetchBridges = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setLoading(true);
    try {
      const result = await getClient()
        .query<BridgesQueryResult>(MY_BRIDGE_RUNTIMES_QUERY, {}, { requestPolicy: "network-only" })
        .toPromise();
      if (result.error) {
        Alert.alert("Failed to load bridges", result.error.message);
        return;
      }
      setBridges(result.data?.myBridgeRuntimes ?? []);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBridges(true);
  }, [fetchBridges]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchBridges(false);
    } finally {
      setRefreshing(false);
    }
  }, [fetchBridges]);

  const runAction = useCallback(
    async (id: string, perform: () => Promise<void>, successMessage: string) => {
      setPendingActionId(id);
      try {
        await perform();
        await fetchBridges(false);
        // Success is silent — visual change in the list is the feedback.
        void successMessage;
      } catch (err) {
        Alert.alert(
          "Action failed",
          err instanceof Error ? err.message : "Unknown error",
        );
      } finally {
        setPendingActionId(null);
      }
    },
    [fetchBridges],
  );

  function approveAllSessions(request: BridgeAccessRequest) {
    void runAction(
      request.id,
      async () => {
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
      },
      "Granted access",
    );
  }

  function denyRequest(request: BridgeAccessRequest) {
    void runAction(
      request.id,
      async () => {
        const result = await getClient()
          .mutation(DENY_BRIDGE_ACCESS_REQUEST_MUTATION, { requestId: request.id })
          .toPromise();
        if (result.error) throw result.error;
      },
      "Denied",
    );
  }

  function revokeGrant(grant: BridgeAccessGrant) {
    Alert.alert(
      "Revoke access",
      `Revoke ${userLabel(grant.granteeUser)}'s access to this bridge?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revoke",
          style: "destructive",
          onPress: () => {
            void runAction(
              grant.id,
              async () => {
                const result = await getClient()
                  .mutation(REVOKE_BRIDGE_ACCESS_GRANT_MUTATION, { grantId: grant.id })
                  .toPromise();
                if (result.error) throw result.error;
              },
              "Revoked",
            );
          },
        },
      ],
    );
  }

  if (loading && bridges.length === 0) {
    return (
      <View style={styles.center}>
        <Text variant="footnote" color="mutedForeground">
          Loading bridges…
        </Text>
      </View>
    );
  }

  if (bridges.length === 0) {
    return (
      <View style={styles.center}>
        <EmptyState
          icon="bolt.horizontal"
          title="No bridges yet"
          subtitle="Run the Trace desktop app to register a local bridge."
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
      {bridges.map((bridge) => (
        <View
          key={bridge.id}
          style={[
            styles.section,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.borderMuted,
              borderRadius: theme.radius.lg,
            },
          ]}
        >
          <View
            style={[
              styles.bridgeHeader,
              {
                paddingHorizontal: theme.spacing.lg,
                paddingVertical: theme.spacing.md,
                borderBottomColor: theme.colors.borderMuted,
                borderBottomWidth:
                  bridge.accessRequests.length > 0 || bridge.accessGrants.length > 0
                    ? StyleSheet.hairlineWidth
                    : 0,
              },
            ]}
          >
            <SymbolView
              name="laptopcomputer"
              size={18}
              tintColor={theme.colors.mutedForeground}
            />
            <View style={styles.bridgeHeaderText}>
              <Text variant="body" color="foreground" numberOfLines={1}>
                {bridge.label}
              </Text>
              <Text variant="caption1" color="dimForeground" numberOfLines={1}>
                {bridge.connected ? "Connected" : "Offline"} ·{" "}
                {bridge.hostingMode === "local" ? "Local" : "Cloud"}
              </Text>
            </View>
            <StatusDot status={bridge.connected ? "active" : "stopped"} size="sm" />
          </View>

          {bridge.accessRequests.length > 0 ? (
            <View>
              <SectionLabel theme={theme} text="Pending requests" />
              {bridge.accessRequests.map((request, index) => {
                const last = index === bridge.accessRequests.length - 1;
                const isPending = pendingActionId === request.id;
                return (
                  <View
                    key={request.id}
                    style={[
                      styles.itemBlock,
                      {
                        paddingHorizontal: theme.spacing.lg,
                        paddingVertical: theme.spacing.md,
                        borderBottomWidth:
                          !last || bridge.accessGrants.length > 0
                            ? StyleSheet.hairlineWidth
                            : 0,
                        borderBottomColor: theme.colors.borderMuted,
                      },
                    ]}
                  >
                    <Text variant="body" color="foreground" numberOfLines={1}>
                      {userLabel(request.requesterUser)}
                    </Text>
                    <Text variant="caption1" color="mutedForeground" numberOfLines={1}>
                      {describeScope(request.scopeType, request.sessionGroup)}
                    </Text>
                    <View style={styles.actionRow}>
                      <Button
                        title="Approve"
                        size="sm"
                        disabled={isPending}
                        onPress={() => approveAllSessions(request)}
                      />
                      <Button
                        title="Deny"
                        size="sm"
                        variant="ghost"
                        disabled={isPending}
                        onPress={() => denyRequest(request)}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}

          {bridge.accessGrants.length > 0 ? (
            <View>
              <SectionLabel theme={theme} text="Active grants" />
              {bridge.accessGrants.map((grant, index) => {
                const last = index === bridge.accessGrants.length - 1;
                return (
                  <ListRow
                    key={grant.id}
                    title={userLabel(grant.granteeUser)}
                    subtitle={describeScope(grant.scopeType, grant.sessionGroup)}
                    trailing={
                      <Button
                        title="Revoke"
                        size="sm"
                        variant="destructive"
                        disabled={pendingActionId === grant.id}
                        onPress={() => revokeGrant(grant)}
                      />
                    }
                    separator={!last}
                  />
                );
              })}
            </View>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

function SectionLabel({ theme, text }: { theme: ReturnType<typeof useTheme>; text: string }) {
  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.sm,
        paddingBottom: 4,
      }}
    >
      <Text
        variant="caption1"
        style={{
          color: theme.colors.dimForeground,
          fontWeight: "600",
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    paddingBottom: 32,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  section: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  bridgeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bridgeHeaderText: { flex: 1, minWidth: 0 },
  itemBlock: {
    gap: 6,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
});
