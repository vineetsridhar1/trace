import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text as NativeText, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView, type SFSymbol } from "expo-symbols";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import {
  AVAILABLE_RUNTIMES_QUERY,
  DISMISS_SESSION_MUTATION,
  generateUUID,
  UPDATE_SESSION_CONFIG_MUTATION,
  useEntityField,
} from "@trace/client-core";
import type {
  CodingTool,
  HostingMode,
  SessionConnection,
  SessionRuntimeInstance,
} from "@trace/gql";
import { getDefaultModel, getModelLabel, getModelsForTool } from "@trace/shared";
import { Glass, Text } from "@/components/design-system";
import { MODE_CYCLE, useComposerModePalette } from "@/hooks/useComposerModePalette";
import { useComposerSubmit, type ComposerMode } from "@/hooks/useComposerSubmit";
import { useClipboardImage } from "@/hooks/useClipboardImage";
import { haptic } from "@/lib/haptics";
import { recordPerf } from "@/lib/perf";
import { applyOptimisticPatch } from "@/lib/optimisticEntity";
import { getClient } from "@/lib/urql";
import { useDraftsStore, type ImageAttachment } from "@/stores/drafts";
import { alpha, useTheme } from "@/theme";
import { ComposerConnectionNotice } from "./ComposerConnectionNotice";
import {
  ComposerMorphPill,
  type ComposerMorphPillItem,
} from "./ComposerMorphPill";
import { ImageAttachmentBar } from "./ImageAttachmentBar";

interface SessionInputComposerProps { sessionId: string }

// Sentinel used by the bridge picker for the "Cloud" option. Mirrors the
// web `CLOUD_RUNTIME_ID` so the shared mental model is identical.
const CLOUD_RUNTIME_ID = "__cloud__";

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
const MAX_IMAGES = 5;
const EMPTY_IMAGES: ImageAttachment[] = [];

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
    | SessionConnection
    | null
    | undefined;
  const sessionGroupId = useEntityField("sessions", sessionId, "sessionGroupId") as
    | string
    | null
    | undefined;
  const repo = useEntityField("sessions", sessionId, "repo") as
    | { id: string }
    | null
    | undefined;
  const channelRepoId = repo?.id;
  const isOptimistic = useEntityField("sessions", sessionId, "_optimistic");
  const isDisconnected = connection?.state === "disconnected";
  const canRetryConnection = connection?.canRetry === true;

  const [text, setText] = useState("");
  const [mode, setMode] = useState<ComposerMode>("code");
  const [modeWidths, setModeWidths] = useState<Partial<Record<ComposerMode, number>>>({});
  const [height, setHeight] = useState(MIN_INPUT_HEIGHT);
  const [errorDraft, setErrorDraft] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [runtimes, setRuntimes] = useState<SessionRuntimeInstance[]>([]);
  const [pastingImage, setPastingImage] = useState(false);

  const images = useDraftsStore((s) => s.images[sessionId] ?? EMPTY_IMAGES);
  const setImages = useDraftsStore((s) => s.setImages);

  const isActive = agentStatus === "active";
  const isNotStarted = agentStatus === "not_started";
  const currentTool: CodingTool = tool === "codex" ? "codex" : "claude_code";
  // Terminal = no more input accepted ever. `done`, `failed`, `stopped` are
  // resumable — web's `canSendMessage` allows sends for them — so they must
  // NOT disable the composer. Only a deleted worktree or a merged session
  // are truly closed.
  const isTerminal = worktreeDeleted === true || sessionStatus === "merged";

  const onFailure = useCallback((draft: string) => { setText(draft); setErrorDraft(draft); }, []);
  const onSuccess = useCallback(() => { setText(""); setErrorDraft(null); }, []);
  const { submit: runSubmit, sending } = useComposerSubmit({ sessionId, isActive, onFailure, onSuccess });

  const trimmed = text.trim();
  // While the session is optimistic (temp id, create mutation in flight), the
  // server has no row to address — a send would fail silently and the draft
  // would flicker. Match web's gate: let the user type, block the send.
  const canInteract = !isTerminal && !sending && !stopping && !isDisconnected && !isOptimistic;
  const canSubmit = canInteract && (trimmed.length > 0 || images.length > 0);
  const canStop = isActive && !stopping;

  const {
    hasImage: clipboardHasImage,
    refresh: refreshClipboard,
    dismiss: dismissClipboard,
  } = useClipboardImage();
  const [pickingImage, setPickingImage] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const showPasteButton =
    canInteract &&
    inputFocused &&
    clipboardHasImage &&
    images.length === 0 &&
    !pastingImage;
  const canAttach = canInteract && !pickingImage && images.length < MAX_IMAGES;

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
    // Mitosis: stop emerges from inside send via translateX; layout frame
    // is fixed at the final position so the GlassView is always laid out
    // at its full size (UIGlassEffect needs a real frame to render).
    stopProgress.value = withTiming(isActive ? 1 : 0, {
      duration: isActive ? 340 : theme.motion.durations.base,
    });
  }, [isActive, stopProgress, theme.motion.durations.base]);
  const inputAnimatedStyle = useAnimatedStyle(() => ({ height: inputHeight.value }));
  const actionClusterAnimatedStyle = useAnimatedStyle(() => ({
    width: ACTION_SIZE + (ACTION_SIZE + ACTION_GAP) * stopProgress.value,
  }));
  const stopSlotAnimatedStyle = useAnimatedStyle(() => {
    const p = stopProgress.value;
    // Starts fully overlapping the send button (translateX = -54),
    // slides to its own slot (translateX = 0). Scale gives the "pop".
    const translateX = -(ACTION_SIZE + ACTION_GAP) * (1 - p);
    const scale = 0.4 + 0.6 * p;
    return {
      opacity: Math.min(1, p * 1.6),
      transform: [{ translateX }, { scale }],
    };
  });
  const sendPulseAnimatedStyle = useAnimatedStyle(() => {
    // Subtle bulge mid-split: sin() peaks at p=0.5 and returns to 1 at both ends.
    const p = Math.max(0, Math.min(1, stopProgress.value));
    const pulse = Math.sin(p * Math.PI);
    return { transform: [{ scale: 1 + pulse * 0.08 }] };
  });

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
  const handlePasteImage = useCallback(async () => {
    if (pastingImage || images.length >= MAX_IMAGES) return;
    setPastingImage(true);
    void haptic.selection();
    try {
      // JPEG at q=0.85 keeps a Mac screenshot comfortably under the 5MB
      // upload cap — PNG at full quality routinely blew past it. Alpha is
      // flattened, which is fine for the chat-screenshot use case.
      const result = await Clipboard.getImageAsync({ format: "jpeg", jpegQuality: 0.85 });
      if (!result?.data) return;
      // expo-clipboard returns `data` as a full `data:image/jpeg;base64,...`
      // URI. Split off the prefix so the rest of the pipeline (upload,
      // optimistic preview) sees the same shape as the gallery picker.
      const prefixMatch = result.data.match(/^data:([^;,]+);base64,(.+)$/);
      if (!prefixMatch) {
        throw new Error("expo-clipboard returned an unexpected data shape");
      }
      const [, mimeType, rawBase64] = prefixMatch;
      const attachment: ImageAttachment = {
        id: generateUUID(),
        mimeType,
        base64: rawBase64,
        previewUri: result.data,
        width: result.size?.width ?? null,
        height: result.size?.height ?? null,
        s3Key: null,
        uploading: false,
      };
      setImages(sessionId, (prev) => {
        if (prev.length >= MAX_IMAGES) return prev;
        return [...prev, attachment];
      });
      dismissClipboard();
      void haptic.light();
    } catch (err) {
      void haptic.error();
      console.warn("[composer] clipboard paste failed", err);
    } finally {
      setPastingImage(false);
    }
  }, [dismissClipboard, images.length, pastingImage, sessionId, setImages]);
  const handlePickFromLibrary = useCallback(async () => {
    if (pickingImage || images.length >= MAX_IMAGES) return;
    setPickingImage(true);
    void haptic.selection();
    try {
      const remaining = MAX_IMAGES - images.length;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        base64: true,
        quality: 0.9,
        allowsMultipleSelection: true,
        selectionLimit: remaining,
      });
      if (result.canceled) return;
      const attachments: ImageAttachment[] = [];
      for (const asset of result.assets) {
        if (!asset.base64) continue;
        const mimeType = asset.mimeType ?? "image/jpeg";
        attachments.push({
          id: generateUUID(),
          mimeType,
          base64: asset.base64,
          previewUri: asset.uri,
          width: asset.width || null,
          height: asset.height || null,
          s3Key: null,
          uploading: false,
        });
      }
      if (attachments.length === 0) return;
      setImages(sessionId, (prev) => {
        const room = MAX_IMAGES - prev.length;
        if (room <= 0) return prev;
        return [...prev, ...attachments.slice(0, room)];
      });
      void haptic.light();
    } catch (err) {
      void haptic.error();
      console.warn("[composer] image library pick failed", err);
    } finally {
      setPickingImage(false);
    }
  }, [images.length, pickingImage, sessionId, setImages]);
  const handleRemoveImage = useCallback(
    (id: string) => {
      setImages(sessionId, (prev) => prev.filter((img) => img.id !== id));
    },
    [sessionId, setImages],
  );
  const handleInputFocus = useCallback(() => {
    setInputFocused(true);
    refreshClipboard();
  }, [refreshClipboard]);
  const handleInputBlur = useCallback(() => {
    setInputFocused(false);
  }, []);
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
  const handleToolChange = useCallback(
    async (newTool: CodingTool) => {
      if (tool === newTool) return;
      const newDefault = getDefaultModel(newTool) ?? null;
      const rollback = applyOptimisticPatch("sessions", sessionId, {
        tool: newTool,
        model: newDefault,
      });
      try {
        const result = await getClient()
          .mutation(UPDATE_SESSION_CONFIG_MUTATION, {
            sessionId,
            tool: newTool,
            model: newDefault,
          })
          .toPromise();
        if (result.error) throw result.error;
      } catch (err) {
        rollback();
        void haptic.error();
        console.warn("[updateSessionConfig] tool change failed", err);
      }
    },
    [sessionId, tool],
  );
  const handleModelChange = useCallback(
    async (newModel: string) => {
      if (model === newModel) return;
      const rollback = applyOptimisticPatch("sessions", sessionId, { model: newModel });
      try {
        const result = await getClient()
          .mutation(UPDATE_SESSION_CONFIG_MUTATION, { sessionId, model: newModel })
          .toPromise();
        if (result.error) throw result.error;
      } catch (err) {
        rollback();
        void haptic.error();
        console.warn("[updateSessionConfig] model change failed", err);
      }
    },
    [model, sessionId],
  );
  // Runtime switching mirrors web: the pill is only a live picker while the
  // session is `not_started`. Once the agent starts (or the session is still
  // optimistic), the pill locks to the current bridge.
  const canChangeBridge = isNotStarted && !isOptimistic;
  const runtimeInstanceId = connection?.runtimeInstanceId ?? null;
  const currentRuntimeValue =
    hosting === "cloud" ? CLOUD_RUNTIME_ID : (runtimeInstanceId ?? CLOUD_RUNTIME_ID);

  useEffect(() => {
    if (!canChangeBridge) return;
    let cancelled = false;
    getClient()
      .query(AVAILABLE_RUNTIMES_QUERY, {
        tool: currentTool,
        sessionGroupId: sessionGroupId ?? null,
      })
      .toPromise()
      .then((result) => {
        if (cancelled) return;
        const data = result.data?.availableRuntimes as SessionRuntimeInstance[] | undefined;
        if (data) setRuntimes(data);
      })
      .catch((err) => {
        console.warn("[availableRuntimes] failed", err);
      });
    return () => {
      cancelled = true;
    };
  }, [canChangeBridge, currentTool, sessionGroupId]);

  const handleBridgeChange = useCallback(
    async (value: string) => {
      if (!canChangeBridge || value === currentRuntimeValue) return;
      const newIsCloud = value === CLOUD_RUNTIME_ID;
      const rt = runtimes.find((r) => r.id === value);
      const nextHosting: HostingMode = newIsCloud
        ? "cloud"
        : (rt?.hostingMode ?? "local");
      const nextConnection: SessionConnection = {
        __typename: connection?.__typename ?? "SessionConnection",
        autoRetryable: connection?.autoRetryable ?? null,
        canMove: connection?.canMove ?? true,
        canRetry: connection?.canRetry ?? true,
        lastDeliveryFailureAt: connection?.lastDeliveryFailureAt ?? null,
        lastError: connection?.lastError ?? null,
        lastSeen: connection?.lastSeen ?? null,
        retryCount: connection?.retryCount ?? 0,
        runtimeInstanceId: newIsCloud ? null : value,
        runtimeLabel: newIsCloud ? null : (rt?.label ?? null),
        state: connection?.state ?? "disconnected",
      };
      const rollback = applyOptimisticPatch("sessions", sessionId, {
        hosting: nextHosting,
        connection: nextConnection,
      });
      try {
        const result = await getClient()
          .mutation(UPDATE_SESSION_CONFIG_MUTATION, {
            sessionId,
            hosting: newIsCloud ? "cloud" : undefined,
            runtimeInstanceId: newIsCloud ? undefined : value,
          })
          .toPromise();
        if (result.error) throw result.error;
      } catch (err) {
        rollback();
        void haptic.error();
        console.warn("[updateSessionConfig] bridge change failed", err);
      }
    },
    [canChangeBridge, connection, currentRuntimeValue, runtimes, sessionId],
  );

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
      : isOptimistic
        ? "Creating session…"
        : isActive
          ? "Queue a message…"
          : "Message…";
  const bridgeIcon: SFSymbol = hosting === "cloud" ? "cloud" : "laptopcomputer";
  const modelLabel = model ? getModelLabel(model) : "Model";
  const bridgeLabel = hosting === "cloud" ? "Cloud" : (connection?.runtimeLabel ?? "Local");
  const modeIconTint = mode === "plan" ? "#8b5cf6" : mode === "ask" ? "#ea580c" : theme.colors.foreground;

  const modelOptions = useMemo(() => getModelsForTool(currentTool), [currentTool]);
  const toolHeaderItems = useMemo<ComposerMorphPillItem[]>(
    () => [
      {
        key: "tool:claude_code",
        label: "Claude Code",
        selected: currentTool === "claude_code",
        disabled: !canInteract,
        onPress: () => void handleToolChange("claude_code"),
      },
      {
        key: "tool:codex",
        label: "Codex",
        selected: currentTool === "codex",
        disabled: !canInteract,
        onPress: () => void handleToolChange("codex"),
      },
    ],
    [canInteract, currentTool, handleToolChange],
  );
  const modelItems = useMemo<ComposerMorphPillItem[]>(
    () =>
      modelOptions.map((option) => ({
        key: `model:${option.value}`,
        label: option.label,
        selected: model === option.value,
        disabled: !canInteract,
        onPress: () => void handleModelChange(option.value),
      })),
    [canInteract, handleModelChange, model, modelOptions],
  );
  const bridgeItems = useMemo<ComposerMorphPillItem[]>(() => {
    const items: ComposerMorphPillItem[] = [
      {
        key: `bridge:${CLOUD_RUNTIME_ID}`,
        label: "Cloud",
        systemIcon: "cloud",
        selected: hosting === "cloud",
        onPress: () => void handleBridgeChange(CLOUD_RUNTIME_ID),
      },
    ];
    for (const r of runtimes) {
      if (r.hostingMode !== "local" || !r.connected) continue;
      const lacksRepo = channelRepoId
        ? !r.registeredRepoIds.includes(channelRepoId)
        : false;
      items.push({
        key: `bridge:${r.id}`,
        label: r.label,
        systemIcon: "laptopcomputer",
        trailingIcon: lacksRepo ? "exclamationmark.triangle.fill" : undefined,
        trailingIconTint: lacksRepo ? theme.colors.warning : undefined,
        selected: runtimeInstanceId === r.id,
        disabled: lacksRepo,
        onPress: () => void handleBridgeChange(r.id),
      });
    }
    return items;
  }, [
    channelRepoId,
    handleBridgeChange,
    hosting,
    runtimeInstanceId,
    runtimes,
    theme.colors.warning,
  ]);

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
      {showPasteButton ? (
        <Animated.View
          entering={FadeIn.duration(220)}
          exiting={FadeOut.duration(140)}
          style={styles.pasteRow}
        >
          <Pressable
            onPress={() => void handlePasteImage()}
            accessibilityRole="button"
            accessibilityLabel="Paste image from clipboard"
            hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.78 : 1 })}
          >
            <Glass
              preset="input"
              glassStyleEffect="clear"
              style={[styles.pastePill, { paddingHorizontal: theme.spacing.md }]}
            >
              <SymbolView
                name="photo.on.rectangle"
                size={14}
                tintColor={theme.colors.foreground}
                resizeMode="scaleAspectFit"
                style={styles.pasteIcon}
              />
              <Text variant="footnote" color="foreground">
                Paste image
              </Text>
            </Glass>
          </Pressable>
        </Animated.View>
      ) : null}
      <ImageAttachmentBar images={images} onRemove={handleRemoveImage} />
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
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
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

          <Glass
            preset="input"
            tint="rgba(0,0,0,0)"
            interactive
            style={[
              styles.attachGlass,
              { borderColor: theme.colors.border, opacity: canAttach ? 1 : 0.45 },
            ]}
          >
            <Pressable
              onPress={() => void handlePickFromLibrary()}
              disabled={!canAttach}
              accessibilityRole="button"
              accessibilityLabel="Attach image from library"
              style={styles.actionPressable}
            >
              <SymbolView
                name="photo.on.rectangle"
                size={18}
                tintColor={theme.colors.foreground}
                weight="medium"
                resizeMode="scaleAspectFit"
                style={styles.attachIcon}
              />
            </Pressable>
          </Glass>

          <Animated.View style={[styles.actionCluster, actionClusterAnimatedStyle]}>
            <View style={styles.actionGlassContainer}>
              <Glass
                preset="input"
                tint={alpha(theme.colors.success, 0.18)}
                interactive
                style={[
                  styles.sendGlass,
                  cardBorderAnimatedStyle,
                  { opacity: canSubmit ? 1 : 0.35 },
                  sendPulseAnimatedStyle,
                ]}
              >
                <Pressable
                  onPress={handleSend}
                  disabled={!canSubmit}
                  accessibilityRole="button"
                  accessibilityLabel={isActive ? "Queue message" : "Send message"}
                  style={styles.actionPressable}
                >
                  <SymbolView name="paperplane.fill" size={16} tintColor={theme.colors.accentForeground} resizeMode="scaleAspectFit" style={styles.sendIcon} />
                </Pressable>
              </Glass>

              <Glass
                preset="input"
                tint={alpha(theme.colors.destructive, 0.22)}
                interactive
                style={[
                  styles.stopGlass,
                  { borderColor: alpha(theme.colors.destructive, 0.42) },
                ]}
              >
                <Pressable
                  onPress={handleStop}
                  disabled={!canStop}
                  accessibilityRole="button"
                  accessibilityLabel="Stop session"
                  style={styles.actionPressable}
                >
                  <SymbolView name="stop.fill" size={14} tintColor={theme.colors.destructive} resizeMode="scaleAspectFit" style={styles.stopIcon} />
                </Pressable>
              </Glass>
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
            headerItems={toolHeaderItems}
            items={modelItems}
            minWidth={0}
            tintAnimatedProps={glassAnimatedProps}
          />
          <ComposerMorphPill
            label={bridgeLabel}
            accessibilityLabel="Bridge"
            disabled={!canChangeBridge}
            items={bridgeItems}
            systemIcon={bridgeIcon}
            align="right"
            minWidth={88}
            tintAnimatedProps={glassAnimatedProps}
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
  },
  actionPressable: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  sendIcon: { width: 16, height: 16 },
  sendGlass: {
    position: "absolute",
    left: 0,
    top: 0,
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    borderWidth: StyleSheet.hairlineWidth,
  },
  stopGlass: {
    position: "absolute",
    left: ACTION_SIZE + ACTION_GAP,
    top: 0,
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    borderWidth: StyleSheet.hairlineWidth,
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
  retryRow: { paddingBottom: 4 },
  pasteRow: { flexDirection: "row", paddingBottom: 6 },
  pastePill: {
    height: 32,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    overflow: "hidden",
    alignSelf: "flex-start",
  },
  pasteIcon: { width: 14, height: 14 },
  attachGlass: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    overflow: "hidden",
  },
  attachIcon: { width: 18, height: 18 },
});
