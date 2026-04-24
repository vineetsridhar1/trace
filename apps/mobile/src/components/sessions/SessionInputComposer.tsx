import { useCallback, useEffect, useRef, useState } from "react";
import { View, type TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import Animated, {
  FadeInDown,
  FadeOutDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { DISMISS_SESSION_MUTATION, generateUUID, useEntityField } from "@trace/client-core";
import type { CodingTool, SessionConnection } from "@trace/gql";
import { useComposerSubmit, type ComposerMode } from "@/hooks/useComposerSubmit";
import { useClipboardImage } from "@/hooks/useClipboardImage";
import { haptic } from "@/lib/haptics";
import { recordPerf } from "@/lib/perf";
import { getClient } from "@/lib/urql";
import { useDraftsStore, type ImageAttachment } from "@/stores/drafts";
import { alpha, useTheme } from "@/theme";
import { ComposerAttachButton } from "./ComposerAttachButton";
import { ComposerConnectionNotice } from "./ComposerConnectionNotice";
import { ComposerMorphPill } from "./ComposerMorphPill";
import { ComposerPasteButton } from "./ComposerPasteButton";
import { ImageAttachmentBar } from "./ImageAttachmentBar";
import {
  INPUT_CARD_MIN_HEIGHT,
  INPUT_CARD_VERTICAL_CHROME,
  MAX_IMAGES,
  MAX_INPUT_HEIGHT,
  MIN_INPUT_HEIGHT,
} from "./session-input-composer/constants";
import { SessionComposerActionButton } from "./session-input-composer/SessionComposerActionButton";
import { SessionComposerInputCard } from "./session-input-composer/SessionComposerInputCard";
import { SessionComposerLeadingChips } from "./session-input-composer/SessionComposerLeadingChips";
import { SessionComposerMeasurementLayer } from "./session-input-composer/SessionComposerMeasurementLayer";
import { styles } from "./session-input-composer/styles";
import { useSessionComposerChips } from "./session-input-composer/useSessionComposerChips";
import { useSessionComposerConfig } from "./session-input-composer/useSessionComposerConfig";

interface SessionInputComposerProps {
  sessionId: string;
  focusRequest?: number;
  bottomSafeAreaInset?: number;
  keyboardVisible?: boolean;
}

const EMPTY_IMAGES: ImageAttachment[] = [];

/**
 * Session composer: a single-line-start liquid glass input next to a
 * separate send circle, with three morphing glass controls below. Mounted by
 * `SessionSurface` only when no pending-input bar is active. Send switches
 * to Queue whenever the agent is running.
 * On failure the draft is restored with an inline retry affordance.
 */
export function SessionInputComposer({
  sessionId,
  focusRequest,
  bottomSafeAreaInset,
  keyboardVisible = false,
}: SessionInputComposerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const resolvedBottomSafeAreaInset = bottomSafeAreaInset ?? insets.bottom;

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
  const isOptimistic = useEntityField("sessions", sessionId, "_optimistic");

  const [text, setText] = useState("");
  const [mode, setMode] = useState<ComposerMode>("code");
  const [height, setHeight] = useState(MIN_INPUT_HEIGHT);
  const [contentHeight, setContentHeight] = useState(MIN_INPUT_HEIGHT);
  const [errorDraft, setErrorDraft] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [pastingImage, setPastingImage] = useState(false);
  const [focused, setFocused] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);

  const images = useDraftsStore((s) => s.images[sessionId] ?? EMPTY_IMAGES);
  const setImages = useDraftsStore((s) => s.setImages);

  const inputRef = useRef<TextInput>(null);
  useEffect(() => {
    if (focusRequest == null) return;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [focusRequest]);

  const isActive = agentStatus === "active";
  const isNotStarted = agentStatus === "not_started";
  const currentTool: CodingTool = tool === "codex" ? "codex" : "claude_code";
  const isTerminal = worktreeDeleted === true || sessionStatus === "merged";
  const isDisconnected = connection?.state === "disconnected";
  const canRetryConnection = connection?.canRetry === true;

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

  const { submit: runSubmit, sending } = useComposerSubmit({
    sessionId,
    isActive,
    onFailure,
    onSuccess,
  });

  const trimmed = text.trim();
  const canInteract =
    !isTerminal && !sending && !stopping && !isDisconnected && !isOptimistic;
  const canSubmit = canInteract && (trimmed.length > 0 || images.length > 0);
  const canStop = isActive && !stopping;
  const canAttach = canInteract && !pickingImage && images.length < MAX_IMAGES;

  const {
    hasImage: clipboardHasImage,
    refresh: refreshClipboard,
    dismiss: dismissClipboard,
  } = useClipboardImage();
  const showPasteButton =
    canInteract &&
    inputFocused &&
    keyboardVisible &&
    clipboardHasImage &&
    images.length === 0 &&
    !pastingImage;

  // `focused` drives the collapsed ↔ expanded split. Focus (not keyboard
  // height) is the source of truth so external keyboards and focus-before-
  // show frames both behave correctly.
  const expanded = focused && keyboardVisible;
  const hasSendable = trimmed.length > 0 || images.length > 0;
  const showSend = (isActive && focused) || (!isActive && hasSendable);
  const showStop = isActive && !focused;

  const {
    cardBorderAnimatedStyle,
    chipAnimatedStyle,
    chipTextAnimatedStyle,
    chipsVisible,
    glassAnimatedProps,
    handleModeMeasure,
    handleModePress,
    handleModelChipPress,
    handleModelMeasure,
    leadingChipsAnimatedStyle,
    modeIconTint,
    modeLabelVisible,
    modeWidthAnimatedStyle,
    modelLabelVisible,
    modelWidthAnimatedStyle,
    resetChips,
    scheduleModelCollapse,
    setModelMenuOpen,
  } = useSessionComposerChips({
    currentTool,
    expanded,
    hasSendable,
    isActive,
    model,
    mode,
    setMode,
  });

  const {
    bridgeIcon,
    bridgeItems,
    bridgeLabel,
    canChangeBridge,
    modelItems,
    modelLabel,
    toolHeaderItems,
  } = useSessionComposerConfig({
    canInteract,
    channelRepoId: repo?.id,
    connection,
    currentTool,
    hosting,
    isNotStarted,
    isOptimistic,
    model,
    sessionGroupId,
    sessionId,
    tool,
  });

  const inputHeight = useSharedValue(MIN_INPUT_HEIGHT);
  useEffect(() => {
    inputHeight.value = withTiming(height, {
      duration: theme.motion.durations.fast,
    });
  }, [height, inputHeight, theme.motion.durations.fast]);
  const inputAnimatedStyle = useAnimatedStyle(() => ({ height: inputHeight.value }));
  const inputCardMinHeight = Math.max(
    INPUT_CARD_MIN_HEIGHT,
    height + INPUT_CARD_VERTICAL_CHROME,
  );
  const inputScrollEnabled = contentHeight > MAX_INPUT_HEIGHT;

  const handleFocus = useCallback(() => {
    setFocused(true);
    setInputFocused(true);
    refreshClipboard();
  }, [refreshClipboard]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    setInputFocused(false);
    resetChips();
  }, [resetChips]);

  const handleChangeText = useCallback((next: string) => {
    const start = performance.now();
    setText(next);
    requestAnimationFrame(() => {
      recordPerf("input-latency", performance.now() - start);
    });
  }, []);

  const handleContentHeightChange = useCallback((contentHeight: number) => {
    setContentHeight((current) => (current === contentHeight ? current : contentHeight));
    const next = Math.min(MAX_INPUT_HEIGHT, Math.max(MIN_INPUT_HEIGHT, contentHeight));
    setHeight((current) => (current === next ? current : next));
  }, []);

  const handleSend = useCallback(() => {
    if (canSubmit) void runSubmit(trimmed, mode);
  }, [canSubmit, mode, runSubmit, trimmed]);

  const handlePasteImage = useCallback(async () => {
    if (pastingImage || images.length >= MAX_IMAGES) return;
    setPastingImage(true);
    void haptic.selection();
    try {
      const result = await Clipboard.getImageAsync({
        format: "jpeg",
        jpegQuality: 0.85,
      });
      if (!result?.data) return;
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
      : isOptimistic
        ? "Creating session…"
        : isActive
          ? "Queue a message…"
          : "Message…";

  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.md,
        paddingBottom: theme.spacing.sm + resolvedBottomSafeAreaInset,
        paddingTop: theme.spacing.xs,
      }}
    >
      <SessionComposerMeasurementLayer
        currentTool={currentTool}
        modelLabel={modelLabel}
        onModeMeasure={handleModeMeasure}
        onModelMeasure={handleModelMeasure}
      />

      {isDisconnected ? (
        <ComposerConnectionNotice
          sessionId={sessionId}
          canRetry={canRetryConnection}
        />
      ) : null}

      <ComposerPasteButton visible={showPasteButton} onPress={() => void handlePasteImage()} />
      <ImageAttachmentBar images={images} onRemove={handleRemoveImage} />

      <View style={styles.composerStack}>
        <View style={styles.inputActionRow}>
          <SessionComposerLeadingChips
            expanded={expanded}
            chipsVisible={chipsVisible}
            canInteract={canInteract}
            currentTool={currentTool}
            mode={mode}
            modeIconTint={modeIconTint}
            modeLabelVisible={modeLabelVisible}
            modelItems={modelItems}
            modelLabel={modelLabel}
            modelLabelVisible={modelLabelVisible}
            toolHeaderItems={toolHeaderItems}
            chipAnimatedStyle={chipAnimatedStyle}
            chipTextAnimatedStyle={chipTextAnimatedStyle}
            glassAnimatedProps={glassAnimatedProps}
            leadingChipsAnimatedStyle={leadingChipsAnimatedStyle}
            modeWidthAnimatedStyle={modeWidthAnimatedStyle}
            modelWidthAnimatedStyle={modelWidthAnimatedStyle}
            onModePress={handleModePress}
            onModelChipPress={handleModelChipPress}
            onModelMenuOpenChange={setModelMenuOpen}
            onModelTouchStart={scheduleModelCollapse}
          />

          <SessionComposerInputCard
            canInteract={canInteract}
            cardMinHeight={inputCardMinHeight}
            errorDraft={errorDraft}
            errorMessage={errorMessage}
            glassAnimatedProps={glassAnimatedProps}
            inputAnimatedStyle={inputAnimatedStyle}
            inputRef={inputRef}
            placeholder={placeholder}
            scrollEnabled={inputScrollEnabled}
            text={text}
            cardBorderAnimatedStyle={cardBorderAnimatedStyle}
            onBlur={handleBlur}
            onChangeText={handleChangeText}
            onContentHeightChange={handleContentHeightChange}
            onFocus={handleFocus}
            onRetry={handleRetry}
          />

          {isActive && !focused ? null : (
            <View style={styles.attachButtonSlot}>
              <ComposerAttachButton
                enabled={canAttach}
                onPress={() => void handlePickFromLibrary()}
              />
            </View>
          )}

          {showSend ? (
            <SessionComposerActionButton
              accessibilityLabel={isActive ? "Queue message" : "Send message"}
              disabled={!canSubmit}
              glassStyle={[cardBorderAnimatedStyle, { opacity: canSubmit ? 1 : 0.35 }]}
              iconName="paperplane.fill"
              iconSize={16}
              iconTint={theme.colors.accentForeground}
              onPress={handleSend}
              tint={alpha(theme.colors.success, 0.18)}
            />
          ) : null}

          {showStop ? (
            <SessionComposerActionButton
              accessibilityLabel="Stop session"
              disabled={!canStop}
              glassStyle={{ borderColor: alpha(theme.colors.destructive, 0.42) }}
              iconName="stop.fill"
              iconSize={14}
              iconTint={theme.colors.destructive}
              onPress={() => void handleStop()}
              tint={alpha(theme.colors.destructive, 0.22)}
            />
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
