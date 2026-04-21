import { useCallback } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import {
  CLEAR_QUEUED_MESSAGES_MUTATION,
  REMOVE_QUEUED_MESSAGE_MUTATION,
  useEntityField,
  useQueuedMessageIdsForSession,
} from "@trace/client-core";
import { Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";
import { alpha, useTheme } from "@/theme";

interface QueuedMessagesStripProps { sessionId: string }

/**
 * Horizontal strip of chips for the session's queued messages. Reads live
 * from the entity store; `queued_message_*` events drive upserts through the
 * shared handler so new chips appear without a refetch and drain as the agent
 * consumes the queue.
 */
export function QueuedMessagesStrip({ sessionId }: QueuedMessagesStripProps) {
  const theme = useTheme();
  const ids = useQueuedMessageIdsForSession(sessionId);

  const handleClearAll = useCallback(() => {
    void haptic.light();
    void getClient().mutation(CLEAR_QUEUED_MESSAGES_MUTATION, { sessionId }).toPromise();
  }, [sessionId]);

  if (ids.length === 0) return null;

  return (
    <View style={[styles.container, {
      borderTopColor: theme.colors.borderMuted,
      backgroundColor: theme.colors.background,
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.xs,
      paddingBottom: theme.spacing.sm,
    }]}>
      <View style={styles.headerRow}>
        <Text variant="caption2" color="mutedForeground" style={styles.label}>
          Queued ({ids.length})
        </Text>
        {ids.length > 1 ? (
          <Pressable
            onPress={handleClearAll}
            accessibilityRole="button"
            accessibilityLabel="Clear all queued messages"
            hitSlop={8}
            style={styles.clearAll}
          >
            <SymbolView name="trash" size={11} tintColor={theme.colors.mutedForeground} resizeMode="scaleAspectFit" style={styles.clearIcon} />
            <Text variant="caption2" color="mutedForeground">Clear all</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled">
        {ids.map((id) => <QueuedMessageChip key={id} id={id} tint={theme.colors.accent} />)}
      </ScrollView>
    </View>
  );
}

function QueuedMessageChip({ id, tint }: { id: string; tint: string }) {
  const theme = useTheme();
  const text = useEntityField("queuedMessages", id, "text");

  const handleRemove = useCallback(() => {
    void haptic.light();
    void getClient().mutation(REMOVE_QUEUED_MESSAGE_MUTATION, { id }).toPromise();
  }, [id]);

  if (!text) return null;

  return (
    <View style={[styles.chip, { backgroundColor: alpha(tint, 0.12), borderColor: alpha(tint, 0.3) }]}>
      <Text variant="caption1" color="foreground" numberOfLines={1} style={styles.chipText}>
        {text}
      </Text>
      <Pressable
        onPress={handleRemove}
        accessibilityRole="button"
        accessibilityLabel="Remove queued message"
        hitSlop={8}
        style={styles.removeButton}
      >
        <SymbolView name="xmark" size={9} tintColor={theme.colors.mutedForeground} resizeMode="scaleAspectFit" style={styles.removeIcon} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderTopWidth: StyleSheet.hairlineWidth },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  label: { letterSpacing: 0.4, textTransform: "uppercase" },
  clearAll: { flexDirection: "row", alignItems: "center", gap: 4 },
  clearIcon: { width: 11, height: 11 },
  row: { flexDirection: "row", gap: 6, paddingRight: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, maxWidth: 220 },
  chipText: { flexShrink: 1 },
  removeButton: { width: 14, height: 14, alignItems: "center", justifyContent: "center" },
  removeIcon: { width: 9, height: 9 },
});
