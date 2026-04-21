import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text as NativeText, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView, type SFSymbol } from "expo-symbols";
import Animated, {
  FadeInDown,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { DISMISS_SESSION_MUTATION, useEntityField } from "@trace/client-core";
import { getModelLabel } from "@trace/shared";
import { Glass, Text } from "@/components/design-system";
import { MODE_CYCLE, useComposerModePalette } from "@/hooks/useComposerModePalette";
import { useComposerSubmit, type ComposerMode } from "@/hooks/useComposerSubmit";
import { haptic } from "@/lib/haptics";
import { recordPerf } from "@/lib/perf";
import { getClient } from "@/lib/urql";
import { alpha, useTheme } from "@/theme";
import { ComposerConnectionNotice } from "./ComposerConnectionNotice";
import {
  ComposerMorphPill,
  type ComposerMorphPillItem,
} from "./ComposerMorphPill";

interface SessionInputComposerProps { sessionId: string }

const MODE_LABEL: Record<ComposerMode, string> = { code: "Code", plan: "Plan", ask: "Ask" };
const MODE_ICON: Record<ComposerMode, SFSymbol> = { code: "pencil", plan: "map", ask: "questionmark.circle" };
const MODE_PILL_HEIGHT = 38;
const MODE_PILL_HORIZONTAL_PADDING = 10;
const MODE_CONTENT_GAP = 5;
const MODE_FALLBACK_WIDTH = 70;
const MIN_INPUT_HEIGHT = 28;
const MAX_INPUT_HEIGHT = 260;
const ACTION_SIZE = 46;
const ACTION_GAP = 8;
const ACTION_CLUSTER_WIDTH = ACTION_SIZE * 2 + ACTION_GAP;

/**
 * Session composer: a single-line-start liquid glass input next to a
 * separate send circle, with three morphing glass controls below. Mounted by
 * `SessionSurface` only when no pending-input bar is active. Send switches
 * to Queue whenever the agent is running.
 * On failure the draft is restored with an inline retry affordance.
 */
export function SessionInputComposer({ sessionId }: SessionInputComposerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus");
  const sessionStatus = useEntityField("sessions", sessionId, "sessionStatus");
  const worktreeDeleted = useEntityField("sessions", sessionId, "worktreeDeleted");
  const tool = useEntityField("sessions", sessionId, "tool") as string | null | undefined;
  const model = useEntityField("sessions", sessionId, "model") as string | null | undefined;
  const hosting = useEntityField("sessions", sessionId, "hosting") as string | null | undefined;
  const connection = useEntityField("sessions", sessionId, "connection") as
    | { state?: string | null; canRetry?: boolean | null; runtimeLabel?: string | null }
    | null
    | undefined;
  const isDisconnected = connection?.state === "disconnected";
  const canRetryConnection = connection?.canRetry === true;

  const [text, setText] = useState("");
  const [mode, setMode] = useState<ComposerMode>("code");
  const [modeWidths, setModeWidths] = useState<Partial<Record<ComposerMode, number>>>({});
  const [height, setHeight] = useState(MIN_INPUT_HEIGHT);
  const [errorDraft, setErrorDraft] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);

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
  const canInteract = !isTerminal && !sending && !stopping && !isDisconnected;
  const canSubmit = canInteract && trimmed.length > 0;
  const canStop = isActive && !stopping;

  const {
    glassAnimatedProps,
    cardBorderAnimatedStyle,
    chipAnimatedStyle,
    chipTextAnimatedStyle,
  } = useComposerModePalette(mode);

  const modeTargetWidth = modeWidths[mode] ?? MODE_FALLBACK_WIDTH;
  const modeWidth = useSharedValue(modeTargetWidth);
  useEffect(() => {
    modeWidth.value = withTiming(modeTargetWidth, { duration: theme.motion.durations.base });
  }, [modeTargetWidth, modeWidth, theme.motion.durations.base]);
  const modeWidthAnimatedStyle = useAnimatedStyle(() => ({ width: modeWidth.value }));

  const inputHeight = useSharedValue(MIN_INPUT_HEIGHT);
  const stopProgress = useSharedValue(isActive ? 1 : 0);
  useEffect(() => {
    inputHeight.value = withTiming(height, { duration: theme.motion.durations.fast });
  }, [height, inputHeight, theme.motion.durations.fast]);
  useEffect(() => {
    stopProgress.value = withTiming(isActive ? 1 : 0, { duration: 240 });
  }, [isActive, stopProgress]);
  const inputAnimatedStyle = useAnimatedStyle(() => ({ height: inputHeight.value }));
  const actionClusterAnimatedStyle = useAnimatedStyle(() => ({
    width: ACTION_SIZE + (ACTION_SIZE + ACTION_GAP) * stopProgress.value,
  }));
  const stopActionAnimatedStyle = useAnimatedStyle(() => ({
    opacity: stopProgress.value,
    transform: [
      { translateX: (1 - stopProgress.value) * -18 },
      { scale: 0.74 + stopProgress.value * 0.26 },
    ],
  }));

  const handleChangeText = useCallback((next: string) => {
    // §16 budget: <16ms from keystroke to next painted frame.
    // Stamp the callback start, then sample at the next animation
    // frame to capture state-set + React commit + paint setup.
    const start = performance.now();
    setText(next);
    requestAnimationFrame(() => {
      recordPerf("input-latency", performance.now() - start);
    });
  }, []);
  const handleSend = useCallback(() => {
    if (canSubmit) void runSubmit(trimmed, mode);
  }, [canSubmit, mode, runSubmit, trimmed]);
  const handleModePress = useCallback(() => {
    void haptic.selection();
    setMode((current) => {
      const idx = MODE_CYCLE.indexOf(current);
      return MODE_CYCLE[(idx + 1) % MODE_CYCLE.length] ?? "code";
    });
  }, []);
  const handleModeMeasure = useCallback((measuredMode: ComposerMode, width: number) => {
    const roundedWidth = Math.ceil(width);
    setModeWidths((current) => {
      if (current[measuredMode] === roundedWidth) return current;
      return { ...current, [measuredMode]: roundedWidth };
    });
  }, []);
  const handleRetry = useCallback(() => {
    if (errorDraft && !isTerminal) void runSubmit(errorDraft, mode);
  }, [errorDraft, isTerminal, mode, runSubmit]);
  const handleStop = useCallback(async () => {
    if (!canStop) return;
    setStopping(true);
    void haptic.medium();
    try {
      const result = await getClient()
        .mutation(DISMISS_SESSION_MUTATION, { id: sessionId })
        .toPromise();
      if (result.error) throw result.error;
    } catch (err) {
      void haptic.error();
      console.warn("[dismissSession] failed", err);
    } finally {
      setStopping(false);
    }
  }, [canStop, sessionId]);

  const placeholder = worktreeDeleted
    ? "Worktree deleted"
    : sessionStatus === "merged"
      ? "Session merged"
      : isActive
        ? "Queue a message…"
        : "Message…";
  const bridgeIcon: SFSymbol = hosting === "cloud" ? "cloud" : "laptopcomputer";
  const toolLabel = tool === "codex" ? "Codex" : "Claude Code";
  const modelLabel = model ? getModelLabel(model) : "Model";
  const bridgeLabel = hosting === "cloud" ? "Cloud" : (connection?.runtimeLabel ?? "Local");
  const modeIconTint = mode === "plan" ? "#8b5cf6" : mode === "ask" ? "#ea580c" : theme.colors.foreground;

  const modelItems = useMemo<ComposerMorphPillItem[]>(
    () => [
      { key: "tool", label: toolLabel },
      { key: "model", label: modelLabel, selected: Boolean(model) },
    ],
    [model, modelLabel, toolLabel],
  );
  const bridgeItems = useMemo<ComposerMorphPillItem[]>(
    () => [
      {
        key: "bridge",
        label: bridgeLabel,
        selected: Boolean(hosting),
        systemIcon: bridgeIcon,
      },
    ],
    [bridgeIcon, bridgeLabel, hosting],
  );

  return (
    <View style={{ paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.sm + insets.bottom, paddingTop: theme.spacing.xs }}>
      <View pointerEvents="none" style={styles.modeMeasureRoot}>
        {MODE_CYCLE.map((measuredMode) => (
          <View
            key={measuredMode}
            onLayout={(event) => handleModeMeasure(measuredMode, event.nativeEvent.layout.width)}
            style={styles.modeMeasurePill}
          >
            <SymbolView
              name={MODE_ICON[measuredMode]}
              size={14}
              tintColor={theme.colors.foreground}
              weight="medium"
              resizeMode="scaleAspectFit"
              style={styles.modeIcon}
            />
            <NativeText style={styles.modeText}>{MODE_LABEL[measuredMode]}</NativeText>
          </View>
        ))}
      </View>
      {isDisconnected ? (
        <ComposerConnectionNotice sessionId={sessionId} canRetry={canRetryConnection} />
      ) : null}
      <View style={styles.composerStack}>
        <View style={styles.inputActionRow}>
          <Glass
            preset="pinnedBar"
            tint="rgba(0,0,0,0)"
            animatedProps={glassAnimatedProps}
            style={[styles.inputCard, cardBorderAnimatedStyle]}
          >
            {errorDraft ? (
              <Pressable onPress={handleRetry} accessibilityRole="button" accessibilityLabel="Retry send" style={styles.retryRow}>
                <Text variant="caption1" style={{ color: theme.colors.destructive }}>Failed to send. Tap to retry.</Text>
              </Pressable>
            ) : null}
            <Animated.View style={[styles.inputWrapper, inputAnimatedStyle]}>
              <TextInput
                value={text}
                onChangeText={handleChangeText}
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
          </Glass>

          <Animated.View style={[styles.actionCluster, actionClusterAnimatedStyle]}>
            <View style={styles.actionGlassContainer}>
              <Pressable
                onPress={handleSend}
                disabled={!canSubmit}
                accessibilityRole="button"
                accessibilityLabel={isActive ? "Queue message" : "Send message"}
                style={styles.actionPressable}
              >
                {({ pressed }) => (
                  <Glass
                    preset="input"
                    tint="rgba(0,0,0,0)"
                    animatedProps={glassAnimatedProps}
                    interactive
                    style={[
                      styles.actionGlass,
                      cardBorderAnimatedStyle,
                      { opacity: canSubmit ? (pressed ? 0.82 : 1) : 0.35 },
                    ]}
                  >
                    <SymbolView name="paperplane.fill" size={16} tintColor={theme.colors.accentForeground} resizeMode="scaleAspectFit" style={styles.sendIcon} />
                  </Glass>
                )}
              </Pressable>

              <Animated.View
                pointerEvents={isActive ? "auto" : "none"}
                style={[styles.stopActionSlot, stopActionAnimatedStyle]}
              >
                <Pressable
                  onPress={handleStop}
                  disabled={!canStop}
                  accessibilityRole="button"
                  accessibilityLabel="Stop session"
                  style={styles.actionPressable}
                >
                  {({ pressed }) => (
                    <Glass
                      preset="input"
                      tint={alpha(theme.colors.destructive, 0.16)}
                      interactive
                      style={[
                        styles.actionGlass,
                        {
                          borderColor: alpha(theme.colors.destructive, 0.42),
                          opacity: canStop ? (pressed ? 0.78 : 1) : 0.45,
                        },
                      ]}
                    >
                      <SymbolView name="stop.fill" size={14} tintColor={theme.colors.destructive} resizeMode="scaleAspectFit" style={styles.stopIcon} />
                    </Glass>
                  )}
                </Pressable>
              </Animated.View>
            </View>
          </Animated.View>
        </View>

        <View style={styles.pillsRow}>
          <Animated.View style={[styles.modeWidthWrapper, modeWidthAnimatedStyle]}>
            <Pressable
              onPress={handleModePress}
              disabled={!canInteract}
              accessibilityRole="button"
              accessibilityLabel={`Interaction mode: ${MODE_LABEL[mode]}. Tap to cycle.`}
              hitSlop={6}
              style={styles.modePressable}
            >
              {({ pressed }) => (
                <Glass
                  preset="input"
                  tint="rgba(0,0,0,0)"
                  animatedProps={glassAnimatedProps}
                  interactive
                  style={[
                    styles.modePill,
                    chipAnimatedStyle,
                    { opacity: canInteract ? (pressed ? 0.78 : 1) : 0.45 },
                  ]}
                >
                  <Animated.View
                    key={mode}
                    entering={FadeInDown.duration(150)}
                    exiting={FadeOutUp.duration(150)}
                    style={styles.modeContent}
                  >
                    <SymbolView
                      name={MODE_ICON[mode]}
                      size={14}
                      tintColor={modeIconTint}
                      weight="medium"
                      resizeMode="scaleAspectFit"
                      style={styles.modeIcon}
                    />
                    <Animated.Text style={[styles.modeText, chipTextAnimatedStyle]}>{MODE_LABEL[mode]}</Animated.Text>
                  </Animated.View>
                </Glass>
              )}
            </Pressable>
          </Animated.View>
          <ComposerMorphPill
            label={modelLabel}
            accessibilityLabel="Model"
            disabled={!canInteract}
            items={modelItems}
            minWidth={120}
            style={styles.modelPill}
          />
          <ComposerMorphPill
            label={bridgeLabel}
            accessibilityLabel="Bridge"
            disabled={!hosting}
            items={bridgeItems}
            systemIcon={bridgeIcon}
            align="right"
            minWidth={88}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  composerStack: { gap: 8 },
  inputActionRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  inputCard: {
    flex: 1,
    minHeight: 46,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  inputWrapper: { overflow: "hidden" },
  input: { fontSize: 16, lineHeight: 21, paddingHorizontal: 2, paddingVertical: 2, textAlignVertical: "top" },
  actionCluster: {
    height: ACTION_SIZE,
    overflow: "hidden",
  },
  actionGlassContainer: {
    width: ACTION_CLUSTER_WIDTH,
    height: ACTION_SIZE,
    flexDirection: "row",
    gap: ACTION_GAP,
  },
  actionPressable: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
  },
  actionGlass: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  sendIcon: { width: 16, height: 16 },
  stopActionSlot: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
  },
  stopIcon: { width: 14, height: 14 },
  pillsRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  modeMeasureRoot: {
    position: "absolute",
    left: -1000,
    top: 0,
    opacity: 0,
  },
  modeMeasurePill: {
    height: MODE_PILL_HEIGHT,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: MODE_CONTENT_GAP,
    paddingHorizontal: MODE_PILL_HORIZONTAL_PADDING,
  },
  modePressable: { width: "100%", height: MODE_PILL_HEIGHT },
  modeWidthWrapper: { height: MODE_PILL_HEIGHT },
  modePill: {
    width: "100%",
    height: MODE_PILL_HEIGHT,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  modeContent: { ...StyleSheet.absoluteFillObject, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: MODE_CONTENT_GAP },
  modeIcon: { width: 14, height: 14 },
  modeText: { fontSize: 13, fontWeight: "700" },
  modelPill: { flex: 1, minWidth: 0 },
  retryRow: { paddingBottom: 4 },
});
