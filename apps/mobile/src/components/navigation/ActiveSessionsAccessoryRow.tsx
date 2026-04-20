import { memo, useCallback } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { useEntityField } from "@trace/client-core";
import { SessionStatusIndicator } from "@/components/channels/SessionStatusIndicator";
import { Text } from "@/components/design-system/Text";
import { haptic } from "@/lib/haptics";
import { timeAgo } from "@/lib/time";
import { type Theme } from "@/theme";

// TODO(15b): open the Session Player sheet with this session focused.
function openSessionPlayer(_sessionId: string) {}

export const ActiveSessionsAccessoryRow = memo(function ActiveSessionsAccessoryRow({
  sessionId,
  width,
  theme,
}: { sessionId: string; width: number; theme: Theme }) {
  const name = useEntityField("sessions", sessionId, "name");
  const sessionBranch = useEntityField("sessions", sessionId, "branch");
  const sessionGroupId = useEntityField("sessions", sessionId, "sessionGroupId");
  const sessionStatus = useEntityField("sessions", sessionId, "sessionStatus");
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus");
  const lastUserMessageAt = useEntityField("sessions", sessionId, "lastUserMessageAt");
  const lastMessageAt = useEntityField("sessions", sessionId, "lastMessageAt");
  const updatedAt = useEntityField("sessions", sessionId, "updatedAt");
  const groupBranch = useEntityField("sessionGroups", sessionGroupId ?? "", "branch");

  const onPress = useCallback(() => {
    haptic.light();
    openSessionPlayer(sessionId);
  }, [sessionId]);

  if (!name) return null;
  const branch = sessionBranch ?? groupBranch ?? null;
  const lastSentAt = lastMessageAt ?? lastUserMessageAt ?? updatedAt ?? null;
  const lastSentLabel = lastSentAt ? timeAgo(lastSentAt) : "";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open session player — ${name}`}
      style={[styles.row, { width }]}
      onPress={onPress}
    >
      <View style={styles.leading}>
        <SessionStatusIndicator status={sessionStatus} agentStatus={agentStatus} size={10} />
      </View>
      <View style={styles.text}>
        <Text variant="body" numberOfLines={1} style={styles.title}>
          {name}
        </Text>
        {branch || lastSentLabel ? (
          <View style={styles.metaRow}>
            {branch ? (
              <Text
                numberOfLines={1}
                style={[
                  styles.branch,
                  theme.typography.mono,
                  { color: theme.colors.dimForeground, fontSize: 12 },
                ]}
              >
                {branch}
              </Text>
            ) : null}
            {lastSentLabel ? (
              <Text
                variant="caption2"
                color="dimForeground"
                numberOfLines={1}
                style={[styles.timestamp, branch ? styles.timestampWithBranch : undefined]}
              >
                {lastSentLabel}
              </Text>
            ) : null}
          </View>
        ) : null}
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

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  leading: {
    width: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, minWidth: 0, paddingBottom: 1 },
  title: { fontWeight: "600" },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
    minHeight: 16,
    marginTop: 1,
  },
  branch: { flexShrink: 1, lineHeight: 16 },
  timestamp: { lineHeight: 16 },
  timestampWithBranch: { marginLeft: 10 },
});
