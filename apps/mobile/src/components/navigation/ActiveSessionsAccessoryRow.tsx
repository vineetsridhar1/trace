import { memo, useCallback } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { useEntityField, type SessionEntity } from "@trace/client-core";
import { Text } from "@/components/design-system/Text";
import { haptic } from "@/lib/haptics";
import { type Theme } from "@/theme";

// TODO(15b): open the Session Player sheet with this session focused.
function openSessionPlayer(_sessionId: string) {}

export const ActiveSessionsAccessoryRow = memo(function ActiveSessionsAccessoryRow({
  sessionId,
  width,
  theme,
}: { sessionId: string; width: number; theme: Theme }) {
  const name = useEntityField("sessions", sessionId, "name");
  const tool = useEntityField("sessions", sessionId, "tool");
  const sessionStatus = useEntityField("sessions", sessionId, "sessionStatus");
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus");

  const onPress = useCallback(() => {
    haptic.light();
    openSessionPlayer(sessionId);
  }, [sessionId]);

  if (!name) return null;
  const subtitle = `${toolLabel(tool)} · ${statusLabel(sessionStatus, agentStatus)}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open session player — ${name}`}
      style={[styles.row, { width }]}
      onPress={onPress}
    >
      <View style={[styles.symbolWrap, { backgroundColor: theme.colors.accentMuted }]}>
        <SymbolView
          name="bolt.horizontal.fill"
          size={16}
          tintColor={theme.colors.accent}
          weight="semibold"
        />
      </View>
      <View style={styles.text}>
        <Text variant="body" numberOfLines={1} style={styles.title}>
          {name}
        </Text>
        <Text variant="caption1" color="mutedForeground" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <SymbolView
        name="chevron.up"
        size={14}
        tintColor={theme.colors.mutedForeground}
        weight="medium"
      />
    </Pressable>
  );
});

function toolLabel(t: SessionEntity["tool"] | undefined): string {
  return t === "claude_code" ? "Claude" : t === "codex" ? "Codex" : "Agent";
}

function statusLabel(
  sessionStatus: SessionEntity["sessionStatus"] | undefined,
  agentStatus: SessionEntity["agentStatus"] | undefined,
): string {
  if (sessionStatus === "needs_input") return "needs input";
  if (sessionStatus === "in_review") return "in review";
  return (agentStatus ?? "").replace(/_/g, " ");
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12 },
  symbolWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1 },
  title: { fontWeight: "600" },
});
