import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { Button, Text } from "@/components/design-system";
import { SessionComposerBottomSheet } from "@/components/sessions/session-input-composer/SessionComposerBottomSheet";
import { alpha, useTheme } from "@/theme";

type ConflictStrategy = "DISCARD" | "COMMIT" | "REBASE";

interface LinkedCheckoutSyncConflictSheetProps {
  open: boolean;
  error: string | null;
  pending: boolean;
  onClose: () => void;
  onResolve: (input: { strategy: ConflictStrategy; commitMessage?: string }) => Promise<void>;
}

const DEFAULT_COMMIT_MESSAGE = "Save local main-worktree changes";

export function LinkedCheckoutSyncConflictSheet({
  open,
  error,
  pending,
  onClose,
  onResolve,
}: LinkedCheckoutSyncConflictSheetProps) {
  const theme = useTheme();
  const [selectedStrategy, setSelectedStrategy] = useState<ConflictStrategy | null>(null);
  const [commitMessage, setCommitMessage] = useState(DEFAULT_COMMIT_MESSAGE);

  useEffect(() => {
    if (open) return;
    setSelectedStrategy(null);
    setCommitMessage(DEFAULT_COMMIT_MESSAGE);
  }, [open]);

  const trimmedCommitMessage = commitMessage.trim();
  const commitDisabled = pending || trimmedCommitMessage.length === 0;
  const selectedCommit = selectedStrategy === "COMMIT";
  const cardBorder = useMemo(
    () => ({
      borderColor: theme.colors.borderMuted,
      backgroundColor: theme.colors.surfaceElevated,
    }),
    [theme.colors.borderMuted, theme.colors.surfaceElevated],
  );

  return (
    <SessionComposerBottomSheet visible={open} onClose={pending ? () => undefined : onClose}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: theme.spacing.md }]}
      >
        <View style={styles.header}>
          <Text variant="headline">Resolve sync conflict</Text>
          <Text variant="footnote" color="mutedForeground">
            Sync stopped because the main worktree has local changes. Choose how Trace should
            resolve them before syncing this workspace.
          </Text>
        </View>

        {error ? (
          <View
            style={[
              styles.errorBox,
              {
                borderColor: theme.colors.borderMuted,
                backgroundColor: alpha(theme.colors.surfaceElevated, 0.82),
              },
            ]}
          >
            <Text variant="caption1" color="mutedForeground">
              {error}
            </Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={() => setSelectedStrategy("COMMIT")}
          style={[
            styles.card,
            cardBorder,
            selectedCommit && {
              borderColor: theme.colors.accent,
              backgroundColor: alpha(theme.colors.accent, 0.12),
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <SymbolView
              name="checkmark.circle"
              size={16}
              tintColor={theme.colors.mutedForeground}
            />
            <Text variant="subheadline">Commit changes</Text>
          </View>
          <Text variant="footnote" color="mutedForeground">
            Import the current main-worktree changes into the session branch, create a commit, then
            sync to that new commit.
          </Text>

          {selectedCommit ? (
            <View style={styles.commitSection}>
              <TextInput
                value={commitMessage}
                onChangeText={setCommitMessage}
                placeholder="Commit message"
                placeholderTextColor={theme.colors.dimForeground}
                editable={!pending}
                style={[
                  styles.commitInput,
                  {
                    borderColor: theme.colors.border,
                    color: theme.colors.foreground,
                    backgroundColor: alpha(theme.colors.surface, 0.7),
                  },
                ]}
              />
              <Button
                title="Commit And Sync"
                size="sm"
                disabled={commitDisabled}
                loading={pending}
                onPress={() =>
                  void onResolve({
                    strategy: "COMMIT",
                    commitMessage: trimmedCommitMessage,
                  })
                }
              />
            </View>
          ) : null}
        </Pressable>

        <View style={styles.optionColumn}>
          <View style={[styles.card, cardBorder]}>
            <View style={styles.cardHeader}>
              <SymbolView name="trash" size={16} tintColor={theme.colors.mutedForeground} />
              <Text variant="subheadline">Discard all changes</Text>
            </View>
            <Text variant="footnote" color="mutedForeground">
              Reset the main worktree to HEAD, remove untracked files, then sync cleanly.
            </Text>
            <View style={styles.buttonSlot}>
              <Button
                title="Discard And Sync"
                variant="destructive"
                size="sm"
                disabled={pending}
                loading={pending}
                onPress={() => void onResolve({ strategy: "DISCARD" })}
              />
            </View>
          </View>

          <View style={[styles.card, cardBorder]}>
            <View style={styles.cardHeader}>
              <SymbolView
                name="arrow.triangle.branch"
                size={16}
                tintColor={theme.colors.mutedForeground}
              />
              <Text variant="subheadline">Replay local changes</Text>
            </View>
            <Text variant="footnote" color="mutedForeground">
              Replay the current main-worktree changes onto the synced session commit and keep them
              as local edits.
            </Text>
            <View style={styles.buttonSlot}>
              <Button
                title="Replay And Sync"
                variant="secondary"
                size="sm"
                disabled={pending}
                loading={pending}
                onPress={() => void onResolve({ strategy: "REBASE" })}
              />
            </View>
          </View>
        </View>

        <Button title="Cancel" variant="ghost" size="sm" disabled={pending} onPress={onClose} />
      </ScrollView>
    </SessionComposerBottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
  },
  header: {
    gap: 6,
  },
  errorBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  card: {
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 14,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  commitSection: {
    gap: 10,
    marginTop: 2,
  },
  commitInput: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionColumn: {
    gap: 12,
  },
  buttonSlot: {
    marginTop: 2,
  },
});
