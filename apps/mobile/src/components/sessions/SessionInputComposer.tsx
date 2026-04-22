import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text as NativeText, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView, type SFSymbol } from "expo-symbols";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
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
import { ComposerAttachButton } from "./ComposerAttachButton";
import { ComposerConnectionNotice } from "./ComposerConnectionNotice";
import {
  ComposerMorphPill,
  type ComposerMorphPillItem,
} from "./ComposerMorphPill";
import { ComposerPasteButton } from "./ComposerPasteButton";
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
const MODEL_FALLBACK_WIDTH = 160;
const CHIP_EXPAND_HOLD_MS = 1800;
const MIN_INPUT_HEIGHT = 28;
const MAX_INPUT_HEIGHT = 260;
const ACTION_SIZE = 46;
const MAX_IMAGES = 5;
const EMPTY_IMAGES: ImageAttachment[] = [];
// Matches ACTION_SIZE so the leading model chip is the same visual size
// as the mode chip and the trailing image/send button.
const MODEL_CHIP_SIZE = ACTION_SIZE;

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [runtimes, setRuntimes] = useState<SessionRuntimeInstance[]>([]);
  const [pastingImage, setPastingImage] = useState(false);

  const images = useDraftsStore((s) => s.images[sessionId] ?? EMPTY_IMAGES);
  const setImages = useDraftsStore((s) => s.setImages);

  // `focused` drives the collapsed ↔ expanded split. Focus (not keyboard
  // height) is the source of truth so external keyboards and focus-before-
  // show frames both behave correctly.
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  // Mode chip behaviour (when focused): starts icon-only. First tap reveals
  // the label; subsequent taps (while the label is visible) cycle modes.
  // Auto-collapses after CHIP_EXPAND_HOLD_MS of no interaction.
  const [modeLabelVisible, setModeLabelVisible] = useState(false);
  const modeCollapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Model chip mirrors the mode chip: collapsed icon (tool logo) → first tap
  // reveals the full ComposerMorphPill label → subsequent taps on the pill
  // open the selection menu (handled by ComposerMorphPill itself). Auto-
  // collapses back to icon after CHIP_EXPAND_HOLD_MS of no interaction.
  const [modelLabelVisible, setModelLabelVisible] = useState(false);
  const modelCollapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [modelMeasuredWidth, setModelMeasuredWidth] = useState<number | null>(null);
  // True while the model selection menu is open — pauses the auto-collapse
  // timer so the pill doesn't shrink out from under the menu.
  const [modelMenuOpen, setModelMenuOpen] = useState(false);

  const isActive = agentStatus === "active";
  const isNotStarted = agentStatus === "not_started";
  const currentTool: CodingTool = tool === "codex" ? "codex" : "claude_code";
  // Terminal = no more input accepted ever. `done`, `failed`, `stopped` are
  // resumable — web's `canSendMessage` allows sends for them — so they must
  // NOT disable the composer. Only a deleted worktree or a merged session
  // are truly closed.
  const isTerminal = worktreeDeleted === true || sessionStatus === "merged";

  const onFailure = useCallback((draft: string, message: string) => {
    setText(draft);
    setErrorDraft(draft);
    setErrorMessage(message);
  }, []);
  const onSuccess = useCallback(() => {
    setText("");
    setErrorDraft(null);
    setErrorMessage(null);
  }, []);
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

  const modeMeasuredWidth = modeWidths[mode] ?? MODE_FALLBACK_WIDTH;
  const modeTargetWidth = modeLabelVisible ? modeMeasuredWidth : ACTION_SIZE;
  const modeWidth = useSharedValue(modeTargetWidth);
  useEffect(() => {
    modeWidth.value = withTiming(modeTargetWidth, { duration: theme.motion.durations.base });
  }, [modeTargetWidth, modeWidth, theme.motion.durations.base]);

  const modelTargetWidth = modelLabelVisible
    ? (modelMeasuredWidth ?? MODEL_FALLBACK_WIDTH)
    : MODEL_CHIP_SIZE;
  const modelWidth = useSharedValue(MODEL_CHIP_SIZE);
  useEffect(() => {
    modelWidth.value = withTiming(modelTargetWidth, { duration: theme.motion.durations.base });
  }, [modelTargetWidth, modelWidth, theme.motion.durations.base]);

  // Drives width/opacity of the two leading chip slots so that when the
  // user starts typing, the chips smoothly shrink and the input flexes
  // into their space (rather than the chips popping out).
  const chipsSlotProgress = useSharedValue(0);
  const modeWidthAnimatedStyle = useAnimatedStyle(() => ({
    width: modeWidth.value * chipsSlotProgress.value,
    opacity: chipsSlotProgress.value,
  }));
  const modelWidthAnimatedStyle = useAnimatedStyle(() => ({
    width: modelWidth.value * chipsSlotProgress.value,
    opacity: chipsSlotProgress.value,
  }));

  const inputHeight = useSharedValue(MIN_INPUT_HEIGHT);
  useEffect(() => {
    inputHeight.value = withTiming(height, { duration: theme.motion.durations.fast });
  }, [height, inputHeight, theme.motion.durations.fast]);
  const inputAnimatedStyle = useAnimatedStyle(() => ({ height: inputHeight.value }));

  const clearModeCollapseTimer = useCallback(() => {
    if (modeCollapseTimer.current) {
      clearTimeout(modeCollapseTimer.current);
      modeCollapseTimer.current = null;
    }
  }, []);
  const scheduleModeCollapse = useCallback(() => {
    clearModeCollapseTimer();
    modeCollapseTimer.current = setTimeout(() => {
      setModeLabelVisible(false);
      modeCollapseTimer.current = null;
    }, CHIP_EXPAND_HOLD_MS);
  }, [clearModeCollapseTimer]);
  const clearModelCollapseTimer = useCallback(() => {
    if (modelCollapseTimer.current) {
      clearTimeout(modelCollapseTimer.current);
      modelCollapseTimer.current = null;
    }
  }, []);
  const scheduleModelCollapse = useCallback(() => {
    clearModelCollapseTimer();
    // If the user has opened the selection menu, the pill should stay
    // expanded for as long as they're interacting with it. Restart the
    // timer once the menu closes.
    if (modelMenuOpen) return;
    modelCollapseTimer.current = setTimeout(() => {
      setModelLabelVisible(false);
      modelCollapseTimer.current = null;
    }, CHIP_EXPAND_HOLD_MS);
  }, [clearModelCollapseTimer, modelMenuOpen]);
  // When the menu closes, restart the auto-collapse timer so the pill
  // returns to icon-only after the usual idle window.
  useEffect(() => {
    if (modelMenuOpen) {
      clearModelCollapseTimer();
      return;
    }
    if (!modelLabelVisible) return;
    clearModelCollapseTimer();
    modelCollapseTimer.current = setTimeout(() => {
      setModelLabelVisible(false);
      modelCollapseTimer.current = null;
    }, CHIP_EXPAND_HOLD_MS);
  }, [clearModelCollapseTimer, modelLabelVisible, modelMenuOpen]);
  const handleFocus = useCallback(() => {
    setFocused(true);
    setInputFocused(true);
    refreshClipboard();
  }, [refreshClipboard]);
  const handleBlur = useCallback(() => {
    setFocused(false);
    setInputFocused(false);
    clearModeCollapseTimer();
    setModeLabelVisible(false);
    clearModelCollapseTimer();
    setModelLabelVisible(false);
  }, [clearModeCollapseTimer, clearModelCollapseTimer]);
  // Ensure timers clean up on unmount.
  useEffect(() => clearModeCollapseTimer, [clearModeCollapseTimer]);
  useEffect(() => clearModelCollapseTimer, [clearModelCollapseTimer]);
  const expanded = focused;
  // Anything that would make the send button appear: typed text or one
  // or more attached images. Mode/model chips and the send button are
  // mutually exclusive — showing both would crowd the row.
  const hasSendable = trimmed.length > 0 || images.length > 0;
  // Leading chips stay up while the model menu is open (which pulls focus
  // away from the text input during backdrop interaction). Otherwise
  // they show only in a focused, empty, idle composer.
  const chipsVisible = (expanded && !hasSendable && !isActive) || modelMenuOpen;
  // Send and stop are mutually exclusive: while the agent is running, a
  // focused composer shows send (for queueing) and an unfocused one shows
  // stop. While idle, send shows iff the composer has text or images.
  const showSend = (isActive && focused) || (!isActive && hasSendable);
  const showStop = isActive && !focused;
  useEffect(() => {
    chipsSlotProgress.value = withTiming(chipsVisible ? 1 : 0, {
      duration: theme.motion.durations.base,
    });
  }, [chipsVisible, chipsSlotProgress, theme.motion.durations.base]);
  useEffect(() => {
    if (!hasSendable) return;
    clearModeCollapseTimer();
    setModeLabelVisible(false);
    if (modelMenuOpen) return;
    clearModelCollapseTimer();
    setModelLabelVisible(false);
  }, [clearModeCollapseTimer, clearModelCollapseTimer, hasSendable, modelMenuOpen]);
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
      // Skip `base64: true` — a 5MB JPEG becomes ~7MB of base64 in JS heap
      // per attachment. We keep the file URI in the draft and read bytes
      // lazily at upload time via `fetch(uri).blob()`.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.9,
        allowsMultipleSelection: true,
        selectionLimit: remaining,
      });
      if (result.canceled) return;
      const attachments: ImageAttachment[] = result.assets.map((asset) => ({
        id: generateUUID(),
        mimeType: asset.mimeType ?? "image/jpeg",
        fileUri: asset.uri,
        previewUri: asset.uri,
        width: asset.width || null,
        height: asset.height || null,
        s3Key: null,
        uploading: false,
      }));
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
  const handleModePress = useCallback(() => {
    void haptic.selection();
    if (!modeLabelVisible) {
      // First tap: reveal the label so the user sees the current mode.
      setModeLabelVisible(true);
      scheduleModeCollapse();
      return;
    }
    // Subsequent taps while the label is visible cycle the mode and
    // keep the label on screen by resetting the collapse timer.
    setMode((current) => {
      const idx = MODE_CYCLE.indexOf(current);
      return MODE_CYCLE[(idx + 1) % MODE_CYCLE.length] ?? "code";
    });
    scheduleModeCollapse();
  }, [modeLabelVisible, scheduleModeCollapse]);
  const handleModeMeasure = useCallback((measuredMode: ComposerMode, width: number) => {
    const roundedWidth = Math.ceil(width);
    setModeWidths((current) => {
      if (current[measuredMode] === roundedWidth) return current;
      return { ...current, [measuredMode]: roundedWidth };
    });
  }, []);
  const handleModelChipPress = useCallback(() => {
    void haptic.selection();
    if (!modelLabelVisible) {
      setModelLabelVisible(true);
      scheduleModelCollapse();
    }
  }, [modelLabelVisible, scheduleModelCollapse]);
  const handleModelMeasure = useCallback((width: number) => {
    const rounded = Math.ceil(width);
    setModelMeasuredWidth((current) => (current === rounded ? current : rounded));
  }, []);
  // Re-measure when the natural content of the pill changes (tool swap or
  // model swap changes icon and label text). The onLayout in the measurement
  // node will fire again once the new content lays out.
  useEffect(() => {
    setModelMeasuredWidth(null);
  }, [currentTool, model]);
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
        <View
          key={`model-measure:${currentTool}:${modelLabel}`}
          onLayout={(event) => handleModelMeasure(event.nativeEvent.layout.width)}
          style={styles.modelMeasurePill}
        >
          <ToolLogo tool={currentTool} size={13} />
          <NativeText style={styles.modelMeasureText}>{modelLabel}</NativeText>
        </View>
      </View>
      {isDisconnected ? (
        <ComposerConnectionNotice sessionId={sessionId} canRetry={canRetryConnection} />
      ) : null}
      <ComposerPasteButton
        visible={showPasteButton}
        onPress={() => void handlePasteImage()}
      />
      <ImageAttachmentBar images={images} onRemove={handleRemoveImage} />
      <View style={styles.composerStack}>
        <View style={styles.inputActionRow}>
          {expanded ? (
            <Animated.View
              entering={FadeIn.duration(140)}
              exiting={FadeOut.duration(100)}
              pointerEvents={chipsVisible ? "auto" : "none"}
              style={[styles.modeChipSlot, modeWidthAnimatedStyle]}
            >
              <Pressable
                onPress={handleModePress}
                disabled={!canInteract}
                accessibilityRole="button"
                accessibilityLabel={
                  modeLabelVisible
                    ? `Interaction mode: ${MODE_LABEL[mode]}. Tap to cycle.`
                    : `Interaction mode: ${MODE_LABEL[mode]}. Tap to reveal.`
                }
                hitSlop={8}
                style={styles.modeChipPressable}
              >
                {({ pressed }) => (
                  <Glass
                    preset="input"
                    animatedProps={glassAnimatedProps}
                    interactive
                    style={[
                      styles.modeChip,
                      chipAnimatedStyle,
                      { opacity: canInteract ? (pressed ? 0.78 : 1) : 0.45 },
                    ]}
                  >
                    <SymbolView
                      name={MODE_ICON[mode]}
                      size={16}
                      tintColor={modeIconTint}
                      weight="medium"
                      resizeMode="scaleAspectFit"
                      style={styles.modeChipIcon}
                    />
                    {modeLabelVisible ? (
                      <Animated.Text
                        entering={FadeIn.duration(140)}
                        exiting={FadeOut.duration(100)}
                        numberOfLines={1}
                        style={[styles.modeText, chipTextAnimatedStyle]}
                      >
                        {MODE_LABEL[mode]}
                      </Animated.Text>
                    ) : null}
                  </Glass>
                )}
              </Pressable>
            </Animated.View>
          ) : null}
          {expanded ? (
            <Animated.View
              key="model-chip"
              entering={FadeIn.duration(140)}
              exiting={FadeOut.duration(100)}
              pointerEvents={chipsVisible ? "auto" : "none"}
              style={[styles.modelChipSlot, modelWidthAnimatedStyle]}
            >
              {modelLabelVisible ? (
                <Animated.View
                  key="model-expanded"
                  entering={FadeIn.duration(140)}
                  exiting={FadeOut.duration(100)}
                  onTouchStart={scheduleModelCollapse}
                  style={styles.modelExpandedWrapper}
                >
                  <ComposerMorphPill
                    label={modelLabel}
                    accessibilityLabel="Model"
                    disabled={!canInteract}
                    headerItems={toolHeaderItems}
                    items={modelItems}
                    minWidth={0}
                    tintAnimatedProps={glassAnimatedProps}
                    onOpenChange={setModelMenuOpen}
                  />
                </Animated.View>
              ) : (
                <Animated.View
                  key="model-collapsed"
                  entering={FadeIn.duration(140)}
                  exiting={FadeOut.duration(100)}
                  style={styles.modelChipCollapsedWrapper}
                >
                  <Glass
                    preset="input"
                    animatedProps={glassAnimatedProps}
                    interactive
                    style={[styles.modelChipCollapsed, { opacity: canInteract ? 1 : 0.4 }]}
                  >
                    <Pressable
                      onPress={handleModelChipPress}
                      disabled={!canInteract}
                      accessibilityRole="button"
                      accessibilityLabel={`Model: ${modelLabel}. Tap to reveal.`}
                      style={styles.modelChipPressable}
                    >
                      <ToolLogo tool={currentTool} size={22} />
                    </Pressable>
                  </Glass>
                </Animated.View>
              )}
            </Animated.View>
          ) : null}
          <Glass
            preset="pinnedBar"
            animatedProps={glassAnimatedProps}
            style={[styles.inputCard, cardBorderAnimatedStyle]}
          >
            {errorDraft ? (
              <Pressable onPress={handleRetry} accessibilityRole="button" accessibilityLabel="Retry send" style={styles.retryRow}>
                <Text variant="caption1" style={{ color: theme.colors.destructive }}>
                  {errorMessage ?? "Failed to send"}. Tap to retry.
                </Text>
              </Pressable>
            ) : null}
            <Animated.View style={[styles.inputWrapper, inputAnimatedStyle]}>
              <TextInput
                ref={inputRef}
                value={text}
                onChangeText={handleChangeText}
                onFocus={handleFocus}
                onBlur={handleBlur}
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

          {isActive && !focused ? null : (
            <ComposerAttachButton
              enabled={canAttach}
              onPress={() => void handlePickFromLibrary()}
            />
          )}

          {showSend ? (
            <Animated.View
              key="send-button"
              entering={FadeIn.duration(140)}
              exiting={FadeOut.duration(100)}
              style={styles.singleActionSlot}
            >
              <Glass
                preset="input"
                tint={alpha(theme.colors.success, 0.18)}
                interactive
                style={[
                  styles.singleActionGlass,
                  cardBorderAnimatedStyle,
                  { opacity: canSubmit ? 1 : 0.35 },
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
            </Animated.View>
          ) : null}

          {showStop ? (
            <Animated.View
              key="stop-button"
              entering={FadeIn.duration(140)}
              exiting={FadeOut.duration(100)}
              style={styles.singleActionSlot}
            >
              <Glass
                preset="input"
                tint={alpha(theme.colors.destructive, 0.22)}
                interactive
                style={[
                  styles.singleActionGlass,
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
            </Animated.View>
          ) : null}
        </View>

        {expanded && canChangeBridge ? (
          <Animated.View
            entering={FadeInDown.duration(160)}
            exiting={FadeOutDown.duration(120)}
            style={styles.bridgeRow}
          >
            <ComposerMorphPill
              label={bridgeLabel}
              accessibilityLabel="Bridge"
              items={bridgeItems}
              systemIcon={bridgeIcon}
              align="left"
              minWidth={88}
              tintAnimatedProps={glassAnimatedProps}
            />
          </Animated.View>
        ) : null}
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
  modeChipSlot: {
    height: ACTION_SIZE,
    overflow: "hidden",
  },
  modeChipPressable: {
    width: "100%",
    height: ACTION_SIZE,
  },
  modeChip: {
    width: "100%",
    height: ACTION_SIZE,
    borderRadius: ACTION_SIZE / 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: MODE_PILL_HORIZONTAL_PADDING,
    gap: MODE_CONTENT_GAP,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  modeChipIcon: { width: 16, height: 16 },
  inputWrapper: { overflow: "hidden" },
  input: { fontSize: 16, lineHeight: 21, paddingHorizontal: 2, paddingVertical: 2, textAlignVertical: "top" },
  singleActionSlot: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
  },
  singleActionGlass: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    borderRadius: ACTION_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  actionPressable: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  sendIcon: { width: 16, height: 16 },
  stopIcon: { width: 14, height: 14 },
  bridgeRow: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  modelChipSlot: {
    height: MODEL_CHIP_SIZE,
    justifyContent: "center",
    // Allow the expanded menu to render above the input card instead of
    // being clipped by the row bounds.
    overflow: "visible",
  },
  modelExpandedWrapper: {
    // Elevate above the input card so the morph pill and its menu render
    // on top instead of being covered by the input.
    zIndex: 20,
  },
  modelChipCollapsedWrapper: {
    width: MODEL_CHIP_SIZE,
    height: MODEL_CHIP_SIZE,
  },
  modelChipCollapsed: {
    width: MODEL_CHIP_SIZE,
    height: MODEL_CHIP_SIZE,
    borderRadius: MODEL_CHIP_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  modelChipPressable: {
    width: MODEL_CHIP_SIZE,
    height: MODEL_CHIP_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
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
  modeIcon: { width: 14, height: 14 },
  modeText: { fontSize: 13, fontWeight: "700" },
  // Matches the intrinsic width of ComposerMorphPill's PillLabel contents
  // (paddingHorizontal 12, gap 6, icon 13, caption1 text). Used to size the
  // collapsed→expanded width animation to the pill's natural width.
  modelMeasurePill: {
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
  },
  modelMeasureText: { fontSize: 12, fontWeight: "600" },
  retryRow: { paddingBottom: 4 },
});

function ToolLogo({ tool, size }: { tool: CodingTool; size: number }) {
  return (
    <Image
      source={
        tool === "codex"
          ? require("../../../assets/images/codex-logo.png")
          : require("../../../assets/images/claude-logo.png")
      }
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}
