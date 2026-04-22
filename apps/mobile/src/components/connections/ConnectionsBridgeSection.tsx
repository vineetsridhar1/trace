import { StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { StatusDot, Text } from "@/components/design-system";
import { ConnectionsBridgeAccessSections } from "@/components/connections/ConnectionsBridgeAccessSections";
import { ConnectionsRepoAccordion } from "@/components/connections/ConnectionsRepoAccordion";
import { useTheme } from "@/theme";
import type {
  ConnectionAccessGrant,
  ConnectionAccessRequest,
  ConnectionBridge,
} from "@/hooks/useConnections";

export function ConnectionsBridgeSection({
  connection,
  pendingActionId,
  onApprove,
  onDeny,
  onRevoke,
  onRefresh,
}: {
  connection: ConnectionBridge;
  pendingActionId: string | null;
  onApprove: (request: ConnectionAccessRequest) => void;
  onDeny: (request: ConnectionAccessRequest) => void;
  onRevoke: (grant: ConnectionAccessGrant) => void;
  onRefresh: () => Promise<void>;
}) {
  const theme = useTheme();
  const { bridge, repos } = connection;
  const hasBody = bridge.connected && repos.length > 0;
  const hasAccess = bridge.accessRequests.length > 0 || bridge.accessGrants.length > 0;

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
          </Text>
        </View>
        <StatusDot status={bridge.connected ? "active" : "stopped"} size="sm" />
      </View>

      {bridge.connected
        ? repos.map((entry) => (
            <ConnectionsRepoAccordion
              key={entry.repo.id}
              bridge={bridge}
              entry={entry}
              onChanged={onRefresh}
            />
          ))
        : null}

      <ConnectionsBridgeAccessSections
        requests={bridge.accessRequests}
        grants={bridge.accessGrants}
        pendingActionId={pendingActionId}
        onApprove={onApprove}
        onDeny={onDeny}
        onRevoke={onRevoke}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
  bridgeHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  bridgeHeaderText: { flex: 1, minWidth: 0 },
});
