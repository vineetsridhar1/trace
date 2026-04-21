import { useCallback, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";
import { useEntityField } from "@trace/client-core";
import { Glass, Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { useComposerSubmit, type ComposerMode } from "@/hooks/useComposerSubmit";
import { alpha, useTheme, type Theme } from "@/theme";

interface SessionInputComposerProps { sessionId: string }

const MODE_CYCLE: ComposerMode[] = ["code", "plan", "ask"];
const MODE_LABEL: Record<ComposerMode, string> = { code: "Code", plan: "Plan", ask: "Ask" };
const MIN_HEIGHT = 38;
const MAX_HEIGHT = 128;

function modeTint(theme: Theme, mode: ComposerMode): string {
  if (mode === "plan") return "#8b5cf6";
  if (mode === "ask") return "#ea580c";
  return theme.colors.accent;
}

/**
 * Bottom-pinned composer for sending or queuing session messages. Mounted by
 * `SessionSurface` only when no pending-input bar is active (ticket 22 owns
 * the bottom slot while the session is waiting on the user). Send switches
 * to Queue whenever the agent is running. On failure, the draft is restored
 * and an inline retry row is surfaced so the user doesn't lose their text.
 */
export function SessionInputComposer({ sessionId }: SessionInputComposerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus");
  const sessionStatus = useEntityField("sessions", sessionId, "sessionStatus");
  const worktreeDeleted = useEntityField("sessions", sessionId, "worktreeDeleted");

  const [text, setText] = useState("");
  const [mode, setMode] = useState<ComposerMode>("code");
  const [height, setHeight] = useState(MIN_HEIGHT);
  const [errorDraft, setErrorDraft] = useState<string | null>(null);

  const isActive = agentStatus === "active";
  const isTerminal =
    agentStatus === "failed" ||
    agentStatus === "stopped" ||
    agentStatus === "done" ||
    sessionStatus === "merged" ||
    worktreeDeleted === true;

  const onFailure = useCallback((draft: string) => {
    setText(draft);
    setErrorDraft(draft);
  }, []);
  const onSuccess = useCallback(() => {
    setText("");
    setErrorDraft(null);
  }, []);
  const { submit: runSubmit, sending } = useComposerSubmit({ sessionId, isActive, onFailure, onSuccess });

  const trimmed = text.trim();
  const canInteract = !isTerminal && !sending;
  const canSubmit = canInteract && trimmed.length > 0;
  const tint = modeTint(theme, mode);

  const cycleMode = useCallback(() => {
    void haptic.selection();
    setMode((m) => MODE_CYCLE[(MODE_CYCLE.indexOf(m) + 1) % MODE_CYCLE.length]!);
  }, []);

  const handleSend = useCallback(() => {
    if (canSubmit) void runSubmit(trimmed, mode);
  }, [canSubmit, mode, runSubmit, trimmed]);

  const handleRetry = useCallback(() => {
    if (errorDraft && !isTerminal) void runSubmit(errorDraft, mode);
  }, [errorDraft, isTerminal, mode, runSubmit]);

  const sendLabel = isActive ? "Queue" : "Send";
  const placeholder = isTerminal
    ? "Session complete"
    : isActive ? "Queue a message…" : "Send a message…";

  return (
    <Glass preset="pinnedBar" style={{
      borderRadius: 0,
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.sm + insets.bottom,
    }}>
      {errorDraft ? (
        <Pressable onPress={handleRetry} accessibilityRole="button" accessibilityLabel="Retry send" style={styles.retryRow}>
          <Text variant="caption1" style={{ color: theme.colors.destructive }}>
            Failed to send. Tap to retry.
          </Text>
        </Pressable>
      ) : null}
      <View style={styles.row}>
        <Pressable
          onPress={cycleMode}
          disabled={!canInteract}
          accessibilityRole="button"
          accessibilityLabel={`Interaction mode: ${MODE_LABEL[mode]}. Tap to cycle.`}
          style={({ pressed }) => [styles.modePill, {
            borderColor: alpha(tint, 0.5),
            backgroundColor: pressed ? alpha(tint, 0.28) : alpha(tint, 0.16),
            opacity: canInteract ? 1 : 0.5,
          }]}
        >
          <Text variant="caption1" style={{ color: tint, fontWeight: "600" }}>{MODE_LABEL[mode]}</Text>
        </Pressable>
        <TextInput
          value={text}
          onChangeText={setText}
          onContentSizeChange={(e) => {
            const h = e.nativeEvent.contentSize.height;
            setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, h)));
          }}
          editable={canInteract}
          multiline
          placeholder={placeholder}
          placeholderTextColor={theme.colors.dimForeground}
          style={[styles.input, {
            height,
            backgroundColor: theme.colors.surfaceDeep,
            borderColor: theme.colors.border,
            color: theme.colors.foreground,
          }]}
        />
        <Pressable
          onPress={handleSend}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel={sendLabel}
          style={({ pressed }) => [styles.sendButton, {
            backgroundColor: canSubmit ? tint : alpha(tint, 0.35),
            opacity: pressed && canSubmit ? 0.85 : 1,
          }]}
        >
          <SymbolView name="paperplane.fill" size={14} tintColor={theme.colors.accentForeground} resizeMode="scaleAspectFit" style={styles.sendIcon} />
        </Pressable>
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  modePill: { height: MIN_HEIGHT, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, minHeight: MIN_HEIGHT, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, fontSize: 15, lineHeight: 20 },
  sendButton: { width: MIN_HEIGHT, height: MIN_HEIGHT, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  sendIcon: { width: 14, height: 14 },
  retryRow: { paddingBottom: 6 },
});
