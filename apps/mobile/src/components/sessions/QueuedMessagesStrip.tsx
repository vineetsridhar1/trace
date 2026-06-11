import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SymbolView } from "expo-symbols";
import {
  CLEAR_QUEUED_MESSAGES_MUTATION,
  REMOVE_QUEUED_MESSAGE_MUTATION,
  STEER_QUEUED_MESSAGE_MUTATION,
  UPDATE_QUEUED_MESSAGE_MUTATION,
  stripPromptWrapping,
  useEntityField,
  useQueuedMessageIdsForSession,
  wrapPrompt,
  type InteractionMode,
} from "@trace/client-core";
import { Glass, Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";
import { alpha, useTheme } from "@/theme";

interface QueuedMessagesStripProps {
  sessionId: string;
  editingId?: string | null;
  onEditMessage?: (id: string) => void;
}

/**
 * Horizontal strip of chips for the session's queued messages. Reads live
 * from the entity store; `queued_message_*` events drive upserts through the
 * shared handler so new chips appear without a refetch and drain as the agent
 * consumes the queue.
 */
export function QueuedMessagesStrip({
  sessionId,
  editingId,
  onEditMessage,
}: QueuedMessagesStripProps) {
  const theme = useTheme();
  const ids = useQueuedMessageIdsForSession(sessionId);

  const handleClearAll = useCallback(() => {
    void haptic.light();
    void getClient().mutation(CLEAR_QUEUED_MESSAGES_MUTATION, { sessionId }).toPromise();
  }, [sessionId]);

  if (ids.length === 0) return null;

  return (
    <View
      style={[
        styles.container,
        {
          borderTopColor: theme.colors.borderMuted,
          backgroundColor: theme.colors.background,
          paddingHorizontal: theme.spacing.md,
          paddingTop: theme.spacing.xs,
          paddingBottom: theme.spacing.sm,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <Text variant="caption2" color="mutedForeground" style={styles.label}>
          Queued ({ids.length}) · tap to edit
        </Text>
        {ids.length > 1 ? (
          <Pressable
            onPress={handleClearAll}
            accessibilityRole="button"
            accessibilityLabel="Clear all queued messages"
            hitSlop={8}
            style={styles.clearAll}
          >
            <SymbolView
              name="trash"
              size={11}
              tintColor={theme.colors.mutedForeground}
              resizeMode="scaleAspectFit"
              style={styles.clearIcon}
            />
            <Text variant="caption2" color="mutedForeground">
              Clear all
            </Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {ids.map((id) => (
          <QueuedMessageChip
            key={id}
            id={id}
            tint={theme.colors.accent}
            selected={editingId === id}
            onEdit={onEditMessage}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function QueuedMessageChip({
  id,
  tint,
  selected,
  onEdit,
}: {
  id: string;
  tint: string;
  selected: boolean;
  onEdit?: (id: string) => void;
}) {
  const theme = useTheme();
  const text = useEntityField("queuedMessages", id, "text") as string | undefined;
  const imageKeys = useEntityField("queuedMessages", id, "imageKeys") as string[] | undefined;
  const displayText = useMemo(() => stripPromptWrapping(text ?? ""), [text]);
  const imageCount = imageKeys?.length ?? 0;

  const handleRemove = useCallback(() => {
    void haptic.light();
    void getClient().mutation(REMOVE_QUEUED_MESSAGE_MUTATION, { id }).toPromise();
  }, [id]);

  const handleSteer = useCallback(() => {
    void haptic.medium();
    void getClient()
      .mutation(STEER_QUEUED_MESSAGE_MUTATION, { id })
      .toPromise()
      .then((result) => {
        if (result.error) {
          Alert.alert("Couldn't steer", result.error.message);
        }
      })
      .catch(() => Alert.alert("Couldn't steer", "Please try again."));
  }, [id]);

  if (!text && imageCount === 0) return null;

  return (
    <Pressable
      onPress={() => {
        void haptic.selection();
        onEdit?.(id);
      }}
      accessibilityRole="button"
      accessibilityLabel="Edit queued message"
      style={[
        styles.chip,
        {
          backgroundColor: alpha(tint, selected ? 0.2 : 0.12),
          borderColor: alpha(tint, selected ? 0.72 : 0.3),
        },
      ]}
    >
      <Text variant="caption1" color="foreground" numberOfLines={1} style={styles.chipText}>
        {displayText || "File attachment"}
      </Text>
      {imageCount > 0 ? (
        <View style={styles.attachmentBadge}>
          <SymbolView
            name="paperclip"
            size={9}
            tintColor={theme.colors.mutedForeground}
            resizeMode="scaleAspectFit"
            style={styles.badgeIcon}
          />
          <Text variant="caption2" color="mutedForeground">
            {imageCount}
          </Text>
        </View>
      ) : null}
      <Pressable
        onPress={handleSteer}
        accessibilityRole="button"
        accessibilityLabel="Steer with queued message"
        hitSlop={8}
        style={[styles.iconButton, { backgroundColor: alpha(theme.colors.accent, 0.14) }]}
      >
        <SymbolView
          name="paperplane.fill"
          size={10}
          tintColor={theme.colors.accent}
          resizeMode="scaleAspectFit"
          style={styles.actionIcon}
        />
      </Pressable>
      <Pressable
        onPress={handleRemove}
        accessibilityRole="button"
        accessibilityLabel="Remove queued message"
        hitSlop={8}
        style={styles.iconButton}
      >
        <SymbolView
          name="xmark"
          size={9}
          tintColor={theme.colors.mutedForeground}
          resizeMode="scaleAspectFit"
          style={styles.removeIcon}
        />
      </Pressable>
    </Pressable>
  );
}

interface QueuedMessageComposerEditorProps {
  id: string;
  onClose: () => void;
}

export function QueuedMessageComposerEditor({ id, onClose }: QueuedMessageComposerEditorProps) {
  const theme = useTheme();
  const text = useEntityField("queuedMessages", id, "text") as string | undefined;
  const imageKeys = useEntityField("queuedMessages", id, "imageKeys") as string[] | undefined;
  const interactionMode = useEntityField("queuedMessages", id, "interactionMode") as
    | string
    | null
    | undefined;
  const displayText = useMemo(() => stripPromptWrapping(text ?? ""), [text]);
  const imageCount = imageKeys?.length ?? 0;
  const [draft, setDraft] = useState(displayText);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(displayText);
  }, [displayText, id]);

  const save = useCallback(async () => {
    const nextText = draft.trim();
    if (!nextText && imageCount === 0) return;
    if (nextText === displayText) {
      onClose();
      return;
    }
    const nextStoredText =
      nextText && (interactionMode === "plan" || interactionMode === "ask")
        ? wrapPrompt(interactionMode as InteractionMode, nextText)
        : nextText;

    setBusy(true);
    try {
      const result = await getClient()
        .mutation(UPDATE_QUEUED_MESSAGE_MUTATION, { id, text: nextStoredText })
        .toPromise();
      if (result.error) {
        Alert.alert("Couldn't edit queued message", result.error.message);
        return;
      }
      onClose();
    } catch {
      Alert.alert("Couldn't edit queued message", "Please try again.");
    } finally {
      setBusy(false);
    }
  }, [displayText, draft, id, imageCount, interactionMode, onClose]);

  const remove = useCallback(async () => {
    setBusy(true);
    try {
      const result = await getClient().mutation(REMOVE_QUEUED_MESSAGE_MUTATION, { id }).toPromise();
      if (result.error) {
        Alert.alert("Couldn't remove queued message", result.error.message);
        return;
      }
      onClose();
    } catch {
      Alert.alert("Couldn't remove queued message", "Please try again.");
    } finally {
      setBusy(false);
    }
  }, [id, onClose]);

  const steer = useCallback(async () => {
    setBusy(true);
    try {
      const saveText = draft.trim();
      if (saveText !== displayText && (saveText || imageCount > 0)) {
        const nextStoredText =
          saveText && (interactionMode === "plan" || interactionMode === "ask")
            ? wrapPrompt(interactionMode as InteractionMode, saveText)
            : saveText;
        const updateResult = await getClient()
          .mutation(UPDATE_QUEUED_MESSAGE_MUTATION, { id, text: nextStoredText })
          .toPromise();
        if (updateResult.error) {
          Alert.alert("Couldn't edit queued message", updateResult.error.message);
          return;
        }
      }
      const steerResult = await getClient()
        .mutation(STEER_QUEUED_MESSAGE_MUTATION, { id })
        .toPromise();
      if (steerResult.error) {
        Alert.alert("Couldn't steer", steerResult.error.message);
        return;
      }
      onClose();
    } catch {
      Alert.alert("Couldn't steer", "Please try again.");
    } finally {
      setBusy(false);
    }
  }, [displayText, draft, id, imageCount, interactionMode, onClose]);

  if (!text && imageCount === 0) return null;

  return (
    <View style={{ paddingHorizontal: theme.spacing.md }}>
      <Glass
        preset="input"
        interactive
        tint={theme.colors.glassTintLight}
        style={[styles.editorGlass, { borderColor: alpha(theme.colors.foreground, 0.16) }]}
      >
        <View
          pointerEvents="none"
          style={[styles.editorShine, { borderColor: alpha(theme.colors.foreground, 0.18) }]}
        />
        <View style={styles.editorHeader}>
          <View style={styles.editorTitleRow}>
            <SymbolView
              name="pencil"
              size={12}
              tintColor={theme.colors.accent}
              resizeMode="scaleAspectFit"
              style={styles.editorTitleIcon}
            />
            <Text variant="caption1" color="mutedForeground" style={styles.editorLabel}>
              Editing queued message
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close queued message editor"
            hitSlop={8}
            style={styles.closeButton}
          >
            <SymbolView
              name="xmark"
              size={12}
              tintColor={theme.colors.mutedForeground}
              resizeMode="scaleAspectFit"
              style={styles.closeIcon}
            />
          </Pressable>
        </View>
        {imageCount > 0 ? (
          <View
            style={[
              styles.inlineAttachmentRow,
              { backgroundColor: alpha(theme.colors.accent, 0.1) },
            ]}
          >
            <SymbolView
              name="paperclip"
              size={12}
              tintColor={theme.colors.accent}
              resizeMode="scaleAspectFit"
              style={styles.attachmentIcon}
            />
            <Text variant="caption1" color="mutedForeground">
              {imageCount} attachment{imageCount === 1 ? "" : "s"}
            </Text>
          </View>
        ) : null}
        <TextInput
          value={draft}
          onChangeText={setDraft}
          editable={!busy}
          multiline
          autoFocus
          placeholder="Queued message"
          placeholderTextColor={theme.colors.mutedForeground}
          selectionColor={theme.colors.accent}
          textAlignVertical="top"
          style={[
            styles.input,
            {
              color: theme.colors.foreground,
              backgroundColor: alpha(theme.colors.background, 0.42),
              borderColor: alpha(theme.colors.foreground, 0.12),
            },
          ]}
        />
        <View style={styles.editorActions}>
          <Pressable
            onPress={remove}
            disabled={busy}
            accessibilityRole="button"
            style={[styles.secondaryAction, { borderColor: alpha(theme.colors.foreground, 0.14) }]}
          >
            <Text variant="subheadline" color="mutedForeground">
              Delete
            </Text>
          </Pressable>
          <View style={styles.primaryActions}>
            <Pressable
              onPress={save}
              disabled={busy || (!draft.trim() && imageCount === 0)}
              accessibilityRole="button"
              style={[
                styles.secondaryAction,
                { borderColor: alpha(theme.colors.foreground, 0.14), opacity: busy ? 0.6 : 1 },
              ]}
            >
              <Text variant="subheadline" color="foreground">
                Save
              </Text>
            </Pressable>
            <Pressable
              onPress={steer}
              disabled={busy || (!draft.trim() && imageCount === 0)}
              accessibilityRole="button"
              style={[
                styles.steerAction,
                { backgroundColor: theme.colors.accent, opacity: busy ? 0.6 : 1 },
              ]}
            >
              <SymbolView
                name="paperplane.fill"
                size={13}
                tintColor={theme.colors.accentForeground}
                resizeMode="scaleAspectFit"
                style={styles.steerIcon}
              />
              <Text variant="subheadline" color="accentForeground">
                Steer
              </Text>
            </Pressable>
          </View>
        </View>
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderTopWidth: StyleSheet.hairlineWidth },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  label: { letterSpacing: 0.4, textTransform: "uppercase" },
  clearAll: { flexDirection: "row", alignItems: "center", gap: 4 },
  clearIcon: { width: 11, height: 11 },
  row: { flexDirection: "row", gap: 6, paddingRight: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingLeft: 10,
    paddingRight: 5,
    paddingVertical: 6,
    maxWidth: 280,
  },
  chipText: { flexShrink: 1 },
  attachmentBadge: { flexDirection: "row", alignItems: "center", gap: 2 },
  badgeIcon: { width: 9, height: 9 },
  iconButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actionIcon: { width: 10, height: 10 },
  removeIcon: { width: 9, height: 9 },
  editorGlass: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 28,
    padding: 12,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 18,
  },
  editorShine: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  editorHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  editorTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  editorTitleIcon: { width: 12, height: 12 },
  editorLabel: { letterSpacing: 0.3, textTransform: "uppercase" },
  closeButton: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  closeIcon: { width: 12, height: 12 },
  inlineAttachmentRow: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  attachmentIcon: { width: 12, height: 12 },
  input: {
    minHeight: 72,
    maxHeight: 160,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    lineHeight: 21,
  },
  editorActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  primaryActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  secondaryAction: {
    minHeight: 38,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  steerAction: {
    minHeight: 38,
    borderRadius: 19,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  steerIcon: { width: 13, height: 13 },
});
