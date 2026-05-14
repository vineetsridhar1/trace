import { memo, useCallback } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { isSessionPreparing, useEntityField } from "@trace/client-core";
import { SessionStatusIndicator } from "@/components/channels/SessionStatusIndicator";
import { Text } from "@/components/design-system/Text";
import { haptic } from "@/lib/haptics";
import { prefetchSessionPlayer, tryOpenSessionPlayer } from "@/lib/sessionPlayer";
import { timeAgo } from "@/lib/time";
import { type Theme } from "@/theme";

export const ActiveSessionsAccessoryRow = memo(function ActiveSessionsAccessoryRow({
  sessionId,
  width,
  theme,
}: {
  sessionId: string;
  width: number;
  theme: Theme;
}) {
  const name = useEntityField("sessions", sessionId, "name");
  const sessionStatus = useEntityField("sessions", sessionId, "sessionStatus");
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus");
  const workdir = useEntityField("sessions", sessionId, "workdir");
  const connection = useEntityField("sessions", sessionId, "connection");
  const lastUserMessageAt = useEntityField("sessions", sessionId, "lastUserMessageAt");
  const lastMessageAt = useEntityField("sessions", sessionId, "lastMessageAt");
  const updatedAt = useEntityField("sessions", sessionId, "updatedAt");

  const onPress = useCallback(() => {
    haptic.light();
    prefetchSessionPlayer(sessionId);
    tryOpenSessionPlayer(sessionId);
  }, [sessionId]);

  if (!name) return null;
  const lastSentAt = lastMessageAt ?? lastUserMessageAt ?? updatedAt ?? null;
  const lastSentLabel = lastSentAt ? timeAgo(lastSentAt) : "";
  const indicatorAgentStatus = isSessionPreparing({
    agentStatus,
    sessionStatus,
    workdir,
    lastUserMessageAt,
    lastMessageAt,
    connection,
  })
    ? "preparing"
    : agentStatus;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open session — ${name}`}
      style={[styles.row, { width }]}
      onPress={onPress}
    >
      <SymbolView
        name="chevron.up"
        size={14}
        tintColor={theme.colors.mutedForeground}
        weight="medium"
        style={styles.chevron}
      />
      <View style={styles.leading}>
        <SessionStatusIndicator
          status={sessionStatus}
          agentStatus={indicatorAgentStatus}
          size={10}
        />
      </View>
      <View style={styles.text}>
        <Text variant="callout" numberOfLines={1} style={styles.title}>
          {name}
        </Text>
      </View>
      {lastSentLabel ? (
        <Text variant="caption2" color="dimForeground" numberOfLines={1} style={styles.timestamp}>
          {lastSentLabel}
        </Text>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 44,
    overflow: "hidden",
    paddingHorizontal: 10,
  },
  chevron: {
    height: 14,
    width: 14,
  },
  leading: {
    width: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, minWidth: 0 },
  title: { fontWeight: "600" },
  timestamp: { flexShrink: 0, lineHeight: 14 },
});
