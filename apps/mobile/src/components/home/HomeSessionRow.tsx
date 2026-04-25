import { memo, useCallback } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import ContextMenu from "react-native-context-menu-view";
import { useEntityField } from "@trace/client-core";
import { Text } from "@/components/design-system";
import { SessionStatusIndicator } from "@/components/channels/SessionStatusIndicator";
import { buildSessionRowAccessibilityLabel } from "@/lib/accessibility";
import { haptic } from "@/lib/haptics";
import { usePressScale } from "@/lib/motion";
import { prefetchSessionPlayer, tryOpenSessionPlayer } from "@/lib/sessionPlayer";
import { timeAgo } from "@/lib/time";
import { useTheme } from "@/theme";
import { useHomeRowMenu } from "./useHomeRowMenu";

// Passing onLongPress to Pressable suppresses onPress when the user holds
// long enough for the native context menu to take over.
const noop = () => {};

export interface HomeSessionRowProps {
  sessionId: string;
}

export const HomeSessionRow = memo(function HomeSessionRow({ sessionId }: HomeSessionRowProps) {
  const theme = useTheme();
  const name = useEntityField("sessions", sessionId, "name");
  const branch = useEntityField("sessions", sessionId, "branch");
  const repo = useEntityField("sessions", sessionId, "repo");
  const sessionGroupId = useEntityField("sessions", sessionId, "sessionGroupId");
  const sessionStatus = useEntityField("sessions", sessionId, "sessionStatus");
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus");
  const lastEventPreview = useEntityField("sessions", sessionId, "_lastEventPreview");
  const lastMessageAt = useEntityField("sessions", sessionId, "lastMessageAt");
  const updatedAt = useEntityField("sessions", sessionId, "updatedAt");
  const prUrl = useEntityField("sessions", sessionId, "prUrl");

  const handlePress = useCallback(() => {
    void haptic.light();
    prefetchSessionPlayer(sessionId);
    tryOpenSessionPlayer(sessionId);
  }, [sessionId]);

  const { actions, onPress: onMenuPress } = useHomeRowMenu({
    sessionId,
    sessionGroupId,
    prUrl,
    isActive: agentStatus === "active",
  });
  // Subtle row scale on press — wide rows feel weird at 0.98, so target the
  // edges-only feedback iOS list rows actually have. Combined with the bg
  // highlight, the press reads as a real touch instead of a web hover.
  const {
    animatedStyle: pressScaleStyle,
    onPressIn: onPressInScale,
    onPressOut,
  } = usePressScale(0.99);

  const handlePressIn = useCallback(() => {
    onPressInScale();
  }, [onPressInScale]);

  if (!name) return null;

  const timestamp = lastMessageAt ?? updatedAt ?? null;
  const repoName = (repo as { name?: string } | null | undefined)?.name ?? null;
  const accessibilityLabel = buildSessionRowAccessibilityLabel({
    name,
    status: sessionStatus,
    secondaryLabel: branch ?? repoName,
    preview: lastEventPreview,
  });

  return (
    <ContextMenu actions={actions} onPress={onMenuPress} preview={null}>
      <Animated.View style={pressScaleStyle}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          onPress={handlePress}
          onLongPress={noop}
          delayLongPress={250}
          onPressIn={handlePressIn}
          onPressOut={onPressOut}
          style={({ pressed }) => [
            styles.row,
            {
              paddingHorizontal: theme.spacing.lg,
              paddingVertical: theme.spacing.md,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: theme.colors.borderMuted,
              backgroundColor: pressed ? theme.colors.surfaceElevated : "transparent",
            },
          ]}
        >
          <View style={styles.main}>
            <View style={styles.titleRow}>
              <SessionStatusIndicator status={sessionStatus} agentStatus={agentStatus} />
              <Text
                variant="body"
                color="foreground"
                numberOfLines={1}
                style={[styles.title, styles.titleText]}
              >
                {name}
              </Text>
            </View>
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
            {lastEventPreview ? (
              <Text
                variant="footnote"
                color="mutedForeground"
                numberOfLines={1}
                style={styles.preview}
              >
                {lastEventPreview}
              </Text>
            ) : null}
          </View>
          <View style={styles.accessory}>
            {timestamp ? (
              <Text variant="caption2" color="dimForeground" style={styles.timestamp}>
                {timeAgo(timestamp)}
              </Text>
            ) : null}
            {repoName ? (
              <Text
                numberOfLines={1}
                style={[
                  styles.repoPill,
                  {
                    fontFamily: theme.typography.mono.fontFamily,
                    backgroundColor: theme.colors.surfaceElevated,
                    color: theme.colors.dimForeground,
                    borderRadius: theme.radius.sm,
                  },
                ]}
              >
                {repoName}
              </Text>
            ) : null}
          </View>
        </Pressable>
      </Animated.View>
    </ContextMenu>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    minHeight: 60,
  },
  main: { flex: 1, minWidth: 0 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  title: { fontWeight: "600" },
  titleText: { flexShrink: 1, minWidth: 0 },
  branch: { marginTop: 2 },
  preview: { marginTop: 4 },
  accessory: {
    marginLeft: 12,
    alignItems: "flex-end",
    gap: 6,
  },
  timestamp: {},
  repoPill: {
    fontSize: 11,
    lineHeight: 13,
    paddingHorizontal: 6,
    paddingVertical: 2,
    maxWidth: 140,
    overflow: "hidden",
  },
});
