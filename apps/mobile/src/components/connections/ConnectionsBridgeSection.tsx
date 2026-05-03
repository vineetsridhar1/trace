import { StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { Button, StatusDot, Text } from "@/components/design-system";
import { ConnectionsBridgeAccessSections } from "@/components/connections/ConnectionsBridgeAccessSections";
import { ConnectionsRepoAccordion } from "@/components/connections/ConnectionsRepoAccordion";
import { formatCapabilities } from "@/lib/bridge-access";
import { useTheme } from "@/theme";
import type {
  ConnectionAccessGrant,
  ConnectionAccessRequest,
  ConnectionBridge,
} from "@/hooks/useConnections";

export function ConnectionsBridgeSection({
  connection,
  pendingActionId,
  onReviewRequest,
  onDeny,
  onManageGrant,
  onRequestAccess,
  onRefresh,
  currentUserId,
}: {
  connection: ConnectionBridge;
  pendingActionId: string | null;
  onReviewRequest: (request: ConnectionAccessRequest) => void;
  onDeny: (request: ConnectionAccessRequest) => void;
  onManageGrant: (grant: ConnectionAccessGrant) => void;
  onRequestAccess: (connection: ConnectionBridge) => void;
  onRefresh: () => Promise<void>;
  currentUserId: string | null;
}) {
  const theme = useTheme();
  const { bridge, repos } = connection;
  const isOwner = bridge.ownerUser.id === currentUserId;
  const hasBody = bridge.connected && repos.length > 0;
  const hasAccess = isOwner || bridge.accessRequests.length > 0 || bridge.accessGrants.length > 0;

  return (
    <View
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
            borderBottomWidth: hasBody || hasAccess ? StyleSheet.hairlineWidth : 0,
          },
        ]}
      >
        <SymbolView name="laptopcomputer" size={18} tintColor={theme.colors.mutedForeground} />
        <View style={styles.bridgeHeaderText}>
          <Text variant="body" color="foreground" numberOfLines={1}>
            {bridge.label}
          </Text>
          <Text variant="caption1" color="dimForeground" numberOfLines={1}>
            {bridge.connected ? "Connected" : "Offline"} -{" "}
            {bridge.hostingMode === "local" ? "Local" : "Cloud"}
            {!isOwner
              ? ` - ${bridge.ownerUser.name ?? bridge.ownerUser.email ?? "Another user"}`
              : ""}
          </Text>
        </View>
        <StatusDot status={bridge.connected ? "active" : "stopped"} size="sm" />
      </View>

      {bridge.connected
        ? repos.map((entry) => (
            <ConnectionsRepoAccordion
              key={entry.repo.id}
              entry={entry}
              runtimeInstanceId={bridge.instanceId}
              onChanged={onRefresh}
            />
          ))
        : null}

      {isOwner ? (
        <ConnectionsBridgeAccessSections
          requests={bridge.accessRequests}
          grants={bridge.accessGrants}
          pendingActionId={pendingActionId}
          onReviewRequest={onReviewRequest}
          onDeny={onDeny}
          onManageGrant={onManageGrant}
        />
      ) : (
        <BridgeAccessRequestBlock
          connection={connection}
          pending={pendingActionId === bridge.id}
          onRequestAccess={onRequestAccess}
        />
      )}
    </View>
  );
}

function BridgeAccessRequestBlock({
  connection,
  pending,
  onRequestAccess,
}: {
  connection: ConnectionBridge;
  pending: boolean;
  onRequestAccess: (connection: ConnectionBridge) => void;
}) {
  const theme = useTheme();
  const request = connection.bridge.accessRequests[0] ?? null;
  const grant = connection.bridge.accessGrants[0] ?? null;

  return (
    <View
      style={[
        styles.requestBlock,
        {
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          borderTopColor: theme.colors.borderMuted,
        },
      ]}
    >
      <View style={styles.requestText}>
        <Text variant="body" color="foreground">
          {grant ? "Access granted" : request ? "Request pending" : "Request bridge access"}
        </Text>
        <Text variant="caption1" color="mutedForeground">
          {grant
            ? formatCapabilities(grant.capabilities)
            : request
              ? "The bridge owner needs to approve your request."
              : "Ask the owner for session and terminal access."}
        </Text>
      </View>
      <Button
        title={request ? "Pending" : grant ? "Granted" : "Request"}
        size="sm"
        variant={request || grant ? "secondary" : "primary"}
        disabled={!!request || !!grant}
        loading={pending}
        onPress={() => onRequestAccess(connection)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
  bridgeHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  bridgeHeaderText: { flex: 1, minWidth: 0 },
  requestBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  requestText: { flex: 1, minWidth: 0, gap: 2 },
});
