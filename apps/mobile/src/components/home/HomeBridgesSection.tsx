import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { StatusDot, Text } from "@/components/design-system";
import { useTheme, type Theme } from "@/theme";
import type { MyBridgeSummary, SyncedCheckoutSummary } from "@/hooks/useMyBridges";

interface HomeBridgesSectionProps {
  bridges: MyBridgeSummary[];
}

interface BridgeCheckoutItem {
  bridge: MyBridgeSummary;
  checkout: SyncedCheckoutSummary;
}

export const HomeBridgesSection = memo(function HomeBridgesSection({
  bridges,
}: HomeBridgesSectionProps) {
  const theme = useTheme();
  const items: BridgeCheckoutItem[] = [];
  for (const bridge of bridges) {
    if (!bridge.connected) continue;
    for (const checkout of bridge.linkedCheckouts) {
      items.push({ bridge, checkout });
    }
  }
  if (items.length === 0) return null;

  return (
    <View>
      <View
        accessibilityRole="header"
        accessibilityLabel={`Syncing, ${items.length} ${items.length === 1 ? "workspace" : "workspaces"}`}
        style={[
          styles.header,
          {
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.sm,
            backgroundColor: theme.colors.background,
          },
        ]}
      >
        <Text
          variant="footnote"
          style={[styles.headerLabel, { color: theme.colors.foreground, fontWeight: "600" }]}
        >
          Syncing
        </Text>
        <Text variant="caption1" color="dimForeground">
          {items.length}
        </Text>
      </View>
      {items.map((item) => (
        <CheckoutRow
          key={`${item.bridge.id}:${item.checkout.repoId}`}
          item={item}
          theme={theme}
        />
      ))}
    </View>
  );
});

interface CheckoutRowProps {
  item: BridgeCheckoutItem;
  theme: Theme;
}

function CheckoutRow({ item, theme }: CheckoutRowProps) {
  const { bridge, checkout } = item;
  const branchLabel = checkout.branch ?? "Syncing";

  return (
    <View
      style={[
        styles.row,
        {
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.sm,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.borderMuted,
        },
      ]}
    >
      <SymbolView
        name="laptopcomputer"
        size={16}
        tintColor={theme.colors.mutedForeground}
        style={styles.icon}
      />
      <View style={styles.main}>
        <View style={styles.titleRow}>
          <Text variant="footnote" color="foreground" numberOfLines={1} style={styles.bridgeLabel}>
            {bridge.label}
          </Text>
          <Text variant="caption1" color="dimForeground" style={styles.separator}>
            ·
          </Text>
          <Text
            variant="footnote"
            color="foreground"
            numberOfLines={1}
            style={styles.workspaceName}
          >
            {checkout.sessionGroup.name}
          </Text>
        </View>
        <Text
          numberOfLines={1}
          style={[
            styles.branch,
            theme.typography.mono,
            { color: theme.colors.dimForeground, fontSize: 11 },
          ]}
        >
          {branchLabel}
        </Text>
      </View>
      <StatusDot status="active" size="sm" />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 32,
  },
  headerLabel: {},
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  icon: {
    width: 16,
    height: 16,
  },
  main: { flex: 1, minWidth: 0 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  bridgeLabel: { fontWeight: "600" },
  separator: {},
  workspaceName: { flexShrink: 1, minWidth: 0 },
  branch: { marginTop: 2 },
});
