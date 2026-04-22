import { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import ContextMenu, {
  type ContextMenuOnPressNativeEvent,
} from "react-native-context-menu-view";
import type { GitCheckpoint } from "@trace/gql";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { Text } from "@/components/design-system";
import { alpha, useTheme } from "@/theme";
import { haptic } from "@/lib/haptics";
import { CheckpointMarker } from "./CheckpointMarker";
import { Markdown } from "./Markdown";
import { COPY_CONTEXT_MENU, stripPromptWrapping } from "./utils";

interface UserMessageBubbleProps {
  text: string;
  actorId?: string;
  actorName?: string | null;
  checkpoints?: GitCheckpoint[];
}

/**
 * Right-aligned user prompt bubble. Long-press opens a native context menu
 * with a Copy action. Git-checkpoint chips render as a footer below the
 * bubble when the prompt produced one or more commits.
 */
export function UserMessageBubble({
  text,
  actorId,
  actorName,
  checkpoints,
}: UserMessageBubbleProps) {
  const theme = useTheme();
  const currentUserId = useAuthStore((s: AuthState) => s.user?.id);
  const isMe = !actorId || actorId === currentUserId;
  const displayName = isMe ? "You" : (actorName ?? "Someone");
  const displayText = stripPromptWrapping(text);

  const handleContextMenuPress = useCallback(
    (event: { nativeEvent: ContextMenuOnPressNativeEvent }) => {
      if (event.nativeEvent.index === 0) {
        void Clipboard.setStringAsync(displayText);
        void haptic.light();
      }
    },
    [displayText],
  );

  return (
    <View style={styles.wrapper}>
      <View style={styles.column}>
        <ContextMenu actions={COPY_CONTEXT_MENU} onPress={handleContextMenuPress}>
          <View
            style={[
              styles.bubble,
              {
                backgroundColor: alpha(theme.colors.accent, 0.18),
                borderColor: alpha(theme.colors.accent, 0.32),
                borderRadius: theme.radius.lg,
                paddingHorizontal: theme.spacing.md,
                paddingTop: theme.spacing.sm,
                paddingBottom: theme.spacing.xs,
                gap: theme.spacing.xs,
              },
            ]}
          >
            <View style={styles.meta}>
              <Text variant="caption1" style={{ color: theme.colors.accent, fontWeight: "600" }}>
                {displayName}
              </Text>
            </View>
            <Markdown compactSpacing>{displayText}</Markdown>
          </View>
        </ContextMenu>
        {checkpoints && checkpoints.length > 0 ? (
          <View style={[styles.footer, { gap: theme.spacing.xs, marginTop: theme.spacing.xs }]}>
            {checkpoints.map((c) => (
              <CheckpointMarker key={c.id} checkpoint={c} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
    alignItems: "flex-end",
    paddingVertical: 4,
  },
  column: {
    maxWidth: "88%",
    alignItems: "flex-end",
  },
  bubble: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  footer: {
    alignItems: "flex-end",
  },
});
