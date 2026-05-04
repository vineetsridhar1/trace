import { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import type { GitCheckpoint } from "@trace/gql";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { Text } from "@/components/design-system";
import { alpha, useTheme } from "@/theme";
import { CheckpointMarker } from "./CheckpointMarker";
import { CopyableMarkdownBlock } from "./CopyableMarkdownBlock";
import { MessageImageGallery } from "./MessageImageGallery";
import { splitCopyBlocks } from "./copy-blocks";
import { stripPromptWrapping } from "./utils";

interface UserMessageBubbleProps {
  text: string;
  actorId?: string;
  actorName?: string | null;
  imageKeys?: string[];
  imagePreviewUrls?: string[];
  checkpoints?: GitCheckpoint[];
}

/**
 * Right-aligned user prompt bubble. Git-checkpoint chips render as a footer
 * below the bubble when the prompt produced one or more commits.
 */
export const UserMessageBubble = memo(function UserMessageBubble({
  text,
  actorId,
  actorName,
  imageKeys,
  imagePreviewUrls,
  checkpoints,
}: UserMessageBubbleProps) {
  const theme = useTheme();
  const currentUserId = useAuthStore((s: AuthState) => s.user?.id);
  const isMe = !actorId || actorId === currentUserId;
  const displayName = isMe ? "You" : (actorName ?? "Someone");
  const displayText = useMemo(() => stripPromptWrapping(text), [text]);
  const blocks = useMemo(() => splitCopyBlocks(displayText), [displayText]);

  return (
    <View style={styles.wrapper}>
      <View style={styles.column}>
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
          <MessageImageGallery imageKeys={imageKeys} previewUrls={imagePreviewUrls} />
          {blocks.length > 0 ? (
            <View style={styles.blocks}>
              {blocks.map((block) => (
                <CopyableMarkdownBlock key={block.id} text={block.text} compactSpacing />
              ))}
            </View>
          ) : null}
        </View>
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
});

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
  blocks: {
    width: "100%",
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
