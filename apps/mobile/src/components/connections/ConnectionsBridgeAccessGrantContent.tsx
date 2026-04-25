import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Switch, View } from "react-native";
import type { BridgeAccessCapability } from "@trace/gql";
import { Button, Text } from "@/components/design-system";
import type { ConnectionAccessGrant } from "@/hooks/useConnections";
import { describeBridgeAccessScope } from "@/lib/bridge-access";
import { alpha, useTheme } from "@/theme";
import { ConnectionsBridgeAccessSectionTitle } from "./ConnectionsBridgeAccessSheetPrimitives";

export function ConnectionsBridgeAccessGrantContent({
  grant,
  pending,
  onRevoke,
  onUpdate,
}: {
  grant: ConnectionAccessGrant;
  pending: boolean;
  onRevoke: (grant: ConnectionAccessGrant) => void;
  onUpdate: (grant: ConnectionAccessGrant, capabilities: BridgeAccessCapability[]) => void;
}) {
  const theme = useTheme();
  const [grantTerminal, setGrantTerminal] = useState(false);

  useEffect(() => {
    setGrantTerminal(grant.capabilities?.includes("terminal") ?? false);
  }, [grant]);

  const capabilities: BridgeAccessCapability[] = grantTerminal
    ? ["session", "terminal"]
    : ["session"];
  const granteeLabel = grant.granteeUser.name ?? grant.granteeUser.email ?? "Unknown user";

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text variant="headline" color="foreground">
          Manage grant
        </Text>
        <Text variant="footnote" color="mutedForeground">
          {granteeLabel} currently has{" "}
          {describeBridgeAccessScope(grant.scopeType, grant.sessionGroup).toLowerCase()}.
        </Text>
      </View>

      <View style={styles.section}>
        <ConnectionsBridgeAccessSectionTitle>Capabilities</ConnectionsBridgeAccessSectionTitle>
        <View
          style={[
            styles.toggleCard,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceDeep,
            },
          ]}
        >
          <View style={styles.toggleCopy}>
            <Text variant="subheadline" color="foreground">
              Sessions
            </Text>
            <Text variant="caption1" color="mutedForeground">
              Always granted
            </Text>
          </View>
        </View>
        <View
          style={[
            styles.toggleCard,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceDeep,
            },
          ]}
        >
          <View style={styles.toggleCopy}>
            <Text variant="subheadline" color="foreground">
              Terminal
            </Text>
            <Text variant="caption1" color="mutedForeground">
              Toggle shell access for this grant
            </Text>
          </View>
          <Switch
            value={grantTerminal}
            onValueChange={setGrantTerminal}
            trackColor={{
              false: theme.colors.border,
              true: alpha(theme.colors.accent, 0.5),
            }}
            thumbColor={grantTerminal ? theme.colors.accent : theme.colors.mutedForeground}
          />
        </View>
      </View>

      <View style={styles.footer}>
        <Button
          title="Revoke"
          variant="destructive"
          disabled={pending}
          onPress={() => onRevoke(grant)}
        />
        <Button
          title="Save"
          variant="primary"
          disabled={pending}
          loading={pending}
          onPress={() => onUpdate(grant, capabilities)}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 20,
    paddingBottom: 12,
  },
  header: {
    gap: 6,
  },
  section: {
    gap: 10,
  },
  toggleCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  toggleCopy: {
    flex: 1,
    gap: 2,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
});
