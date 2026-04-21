import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView, type SFSymbol } from "expo-symbols";
import Animated, {
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useEntityField } from "@trace/client-core";
import { getModelLabel } from "@trace/shared";
import { Glass, Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { useComposerSubmit, type ComposerMode } from "@/hooks/useComposerSubmit";
import { alpha, useTheme } from "@/theme";

interface SessionInputComposerProps { sessionId: string }

const MODE_CYCLE: ComposerMode[] = ["code", "plan", "ask"];
const MODE_LABEL: Record<ComposerMode, string> = { code: "Code", plan: "Plan", ask: "Ask" };
const MIN_INPUT_HEIGHT = 28;
const MAX_INPUT_HEIGHT = 140;
const MODE_PROGRESS_INPUT = [0, 1, 2];

/**
 * Slack-style composer: one floating glass card with the multiline input on
 * top and a row of meta controls (mode, model, hosting) plus the send arrow
 * along the bottom. Mounted by `SessionSurface` only when no pending-input
 * bar is active. Send switches to Queue whenever the agent is running.
 * On failure the draft is restored with an inline retry affordance.
 */
export function SessionInputComposer({ sessionId }: SessionInputComposerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus");
  const sessionStatus = useEntityField("sessions", sessionId, "sessionStatus");
  const worktreeDeleted = useEntityField("sessions", sessionId, "worktreeDeleted");
  const model = useEntityField("sessions", sessionId, "model");
  const hosting = useEntityField("sessions", sessionId, "hosting");

  const [text, setText] = useState("");
  const [mode, setMode] = useState<ComposerMode>("code");
  const [height, setHeight] = useState(MIN_INPUT_HEIGHT);
  const [errorDraft, setErrorDraft] = useState<string | null>(null);

  const isActive = agentStatus === "active";
  // Terminal = no more input accepted ever. `done`, `failed`, `stopped` are
  // resumable — web's `canSendMessage` allows sends for them — so they must
  // NOT disable the composer. Only a deleted worktree or a merged session
  // are truly closed.
  const isTerminal = worktreeDeleted === true || sessionStatus === "merged";

  const onFailure = useCallback((draft: string) => { setText(draft); setErrorDraft(draft); }, []);
  const onSuccess = useCallback(() => { setText(""); setErrorDraft(null); }, []);
  const { submit: runSubmit, sending } = useComposerSubmit({ sessionId, isActive, onFailure, onSuccess });

  const trimmed = text.trim();
  const canInteract = !isTerminal && !sending;
  const canSubmit = canInteract && trimmed.length > 0;

  const modeIndex = MODE_CYCLE.indexOf(mode);
  const modeProgress = useSharedValue(modeIndex);
  useEffect(() => {
    modeProgress.value = withTiming(modeIndex, { duration: theme.motion.durations.base });
  }, [modeIndex, modeProgress, theme.motion.durations.base]);

  const inputHeight = useSharedValue(MIN_INPUT_HEIGHT);
  useEffect(() => {
    inputHeight.value = withTiming(height, { duration: 140 });
  }, [height, inputHeight]);
  const inputAnimatedStyle = useAnimatedStyle(() => ({ height: inputHeight.value }));

  // Per-mode color palette precomputed once per theme. `code` stays on the
  // neutral foreground tokens so its tint reads as default chrome; plan/ask
  // lean on their accent hues but at a softer alpha on the glass itself.
  const palette = useMemo(() => {
    const fg = theme.colors.foreground;
    const accent = theme.colors.accent;
    const plan = "#8b5cf6";
    const ask = "#ea580c";
    return {
      glassTint: ["rgba(0,0,0,0)", alpha(plan, 0.14), alpha(ask, 0.14)],
      cardBorder: [alpha(fg, 0.08), alpha(plan, 0.25), alpha(ask, 0.25)],
      chipBorder: [alpha(fg, 0.12), alpha(plan, 0.5), alpha(ask, 0.5)],
      chipBg: [alpha(fg, 0.05), alpha(plan, 0.16), alpha(ask, 0.16)],
      chipText: [fg, plan, ask],
      sendBg: [accent, plan, ask],
    };
  }, [theme.colors.accent, theme.colors.foreground]);

  const glassAnimatedProps = useAnimatedProps(() => ({
    tintColor: interpolateColor(modeProgress.value, MODE_PROGRESS_INPUT, palette.glassTint),
  }));
  const cardBorderAnimatedStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(modeProgress.value, MODE_PROGRESS_INPUT, palette.cardBorder),
  }));
  const chipAnimatedStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(modeProgress.value, MODE_PROGRESS_INPUT, palette.chipBorder),
    backgroundColor: interpolateColor(modeProgress.value, MODE_PROGRESS_INPUT, palette.chipBg),
  }));
  const chipTextAnimatedStyle = useAnimatedStyle(() => ({
    color: interpolateColor(modeProgress.value, MODE_PROGRESS_INPUT, palette.chipText),
  }));
  const sendButtonAnimatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(modeProgress.value, MODE_PROGRESS_INPUT, palette.sendBg),
  }));

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

  const placeholder = worktreeDeleted
    ? "Worktree deleted"
    : sessionStatus === "merged"
      ? "Session merged"
      : isActive
        ? "Queue a message…"
        : "Message…";
  const bridgeIcon: SFSymbol = hosting === "cloud" ? "cloud" : "laptopcomputer";

  return (
    <View style={{ paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.sm + insets.bottom, paddingTop: theme.spacing.xs }}>
      <Glass
        preset="pinnedBar"
        tint="rgba(0,0,0,0)"
        animatedProps={glassAnimatedProps}
        style={[styles.card, cardBorderAnimatedStyle]}
      >
        {errorDraft ? (
          <Pressable onPress={handleRetry} accessibilityRole="button" accessibilityLabel="Retry send" style={styles.retryRow}>
            <Text variant="caption1" style={{ color: theme.colors.destructive }}>Failed to send. Tap to retry.</Text>
          </Pressable>
        ) : null}
        <Animated.View style={[styles.inputWrapper, inputAnimatedStyle]}>
          <TextInput
            value={text}
            onChangeText={setText}
            onContentSizeChange={(e) => {
              const h = e.nativeEvent.contentSize.height;
              const next = Math.min(MAX_INPUT_HEIGHT, Math.max(MIN_INPUT_HEIGHT, h));
              if (next !== height) setHeight(next);
            }}
            editable={canInteract}
            multiline
            placeholder={placeholder}
            placeholderTextColor={theme.colors.dimForeground}
            style={[styles.input, { color: theme.colors.foreground }]}
          />
        </Animated.View>
        <View style={styles.controlsRow}>
          <View style={styles.optionsGroup}>
            <Pressable
              onPress={cycleMode}
              disabled={!canInteract}
              accessibilityRole="button"
              accessibilityLabel={`Interaction mode: ${MODE_LABEL[mode]}. Tap to cycle.`}
              style={{ opacity: canInteract ? 1 : 0.5 }}
            >
              {({ pressed }) => (
                <Animated.View style={[styles.chip, chipAnimatedStyle, { opacity: pressed ? 0.85 : 1 }]}>
                  <Animated.Text style={[styles.chipText, chipTextAnimatedStyle]}>
                    {MODE_LABEL[mode]}
                  </Animated.Text>
                </Animated.View>
              )}
            </Pressable>
            {model ? (
              <View style={[styles.chip, { borderColor: alpha(theme.colors.foreground, 0.12) }]}>
                <Text variant="caption1" color="mutedForeground" numberOfLines={1}>{getModelLabel(model)}</Text>
              </View>
            ) : null}
            {hosting ? (
              <View style={[styles.iconChip, { borderColor: alpha(theme.colors.foreground, 0.12) }]}>
                <SymbolView name={bridgeIcon} size={12} tintColor={theme.colors.mutedForeground} resizeMode="scaleAspectFit" style={styles.iconChipGlyph} />
              </View>
            ) : null}
          </View>
          <Pressable
            onPress={handleSend}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityLabel={isActive ? "Queue message" : "Send message"}
          >
            {({ pressed }) => (
              <Animated.View style={[styles.sendButton, sendButtonAnimatedStyle, {
                opacity: canSubmit ? (pressed ? 0.85 : 1) : 0.3,
              }]}>
                <SymbolView name="arrow.up" size={16} tintColor={theme.colors.accentForeground} resizeMode="scaleAspectFit" style={styles.sendIcon} />
              </Animated.View>
            )}
          </Pressable>
        </View>
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, gap: 6 },
  inputWrapper: { overflow: "hidden" },
  input: { fontSize: 16, lineHeight: 21, paddingHorizontal: 2, paddingVertical: 2, textAlignVertical: "top" },
  controlsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 4 },
  optionsGroup: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  chipText: { fontSize: 12, lineHeight: 16, fontWeight: "600" },
  iconChip: { width: 26, height: 26, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },
  iconChipGlyph: { width: 12, height: 12 },
  sendButton: { width: 30, height: 30, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  sendIcon: { width: 16, height: 16 },
  retryRow: { paddingBottom: 4 },
});
