import { memo, useCallback } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { useEntityField } from "@trace/client-core";
import { Text } from "@/components/design-system";
import { useLatestSessionIdForGroup } from "@/hooks/useChannelSessionGroups";
import { appSessionSubtitle } from "@/lib/app-sessions";
import { haptic } from "@/lib/haptics";
import { prefetchSessionPlayer, tryOpenSessionPlayer } from "@/lib/sessionPlayer";
import { timeAgo } from "@/lib/time";
import { alpha, useTheme } from "@/theme";

export const CreationRow = memo(function CreationRow({ groupId, kind }: { groupId: string; kind: "app" | "design" }) {
  const theme = useTheme();
  const name = useEntityField("sessionGroups", groupId, "name") as string | null | undefined;
  const status = useEntityField("sessionGroups", groupId, "status") as string | null | undefined;
  const updatedAt = useEntityField("sessionGroups", groupId, "updatedAt") as string | null | undefined;
  const latestSessionId = useLatestSessionIdForGroup(groupId);
  const agentStatus = useEntityField("sessions", latestSessionId ?? "", "agentStatus") as string | null | undefined;
  const preview = useEntityField("sessions", latestSessionId ?? "", "_lastEventPreview") as string | null | undefined;
  const sessionUpdatedAt = useEntityField("sessions", latestSessionId ?? "", "updatedAt") as string | null | undefined;

  const open = useCallback(() => {
    if (!latestSessionId) return;
    void haptic.light();
    prefetchSessionPlayer(latestSessionId);
    tryOpenSessionPlayer(latestSessionId);
  }, [latestSessionId]);

  if (!name) return null;
  const subtitle = appSessionSubtitle({ agentStatus, preview, status });
  const timestamp = sessionUpdatedAt ?? updatedAt;
  const symbol = kind === "app" ? "square.grid.2x2" : "paintpalette";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${kind}, ${subtitle}`}
      disabled={!latestSessionId}
      onPress={open}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.colors.border, backgroundColor: pressed ? alpha(theme.colors.accent, 0.1) : "transparent" },
      ]}
    >
      <SymbolView name={symbol} size={21} tintColor={kind === "design" ? "#0a84ff" : theme.colors.mutedForeground} style={styles.icon} />
      <View style={styles.copy}>
        <View style={styles.titleLine}>
          <Text variant="body" numberOfLines={1} style={styles.title}>{name}</Text>
          {timestamp ? <Text variant="caption1" color="dimForeground">{timeAgo(timestamp)}</Text> : null}
        </View>
        <Text variant="caption1" color="dimForeground" numberOfLines={1} style={styles.meta}>
          {kind === "app" ? "App" : "Design"} · {subtitle}
        </Text>
      </View>
      <SymbolView name="chevron.right" size={12} tintColor={theme.colors.dimForeground} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  icon: { width: 28, height: 28 },
  copy: { flex: 1, minWidth: 0 },
  titleLine: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  title: { flex: 1, minWidth: 0, fontWeight: "600" },
  meta: { marginTop: 3 },
});
