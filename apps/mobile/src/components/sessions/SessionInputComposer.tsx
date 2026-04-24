import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, View, type TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { SymbolView } from "expo-symbols";
import { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { DISMISS_SESSION_MUTATION, generateUUID, useEntityField } from "@trace/client-core";
import type { CodingTool, SessionConnection } from "@trace/gql";
import { useComposerSubmit, type ComposerMode } from "@/hooks/useComposerSubmit";
import { useClipboardImage } from "@/hooks/useClipboardImage";
import { useSlashCommands } from "@/hooks/useSlashCommands";
import { haptic } from "@/lib/haptics";
import { recordPerf } from "@/lib/perf";
import {
  filterSlashCommands,
  getActiveSlashCommandQuery,
  insertSlashCommand,
} from "@/lib/slashCommands";
import { getClient } from "@/lib/urql";
import { createQuickSession } from "@/lib/createQuickSession";
import { useDraftsStore, type ImageAttachment } from "@/stores/drafts";
import { alpha, useTheme } from "@/theme";
import { ComposerAttachButton } from "./ComposerAttachButton";
import { ComposerConnectionNotice } from "./ComposerConnectionNotice";
import { ComposerPasteButton } from "./ComposerPasteButton";
import { ImageAttachmentBar } from "./ImageAttachmentBar";
import { SessionModelPickerSheetContent } from "./SessionModelPickerSheetContent";
import { SessionRuntimePickerSheetContent } from "./SessionRuntimePickerSheetContent";
import {
  MAX_IMAGES,
  MAX_INPUT_HEIGHT,
  MIN_INPUT_HEIGHT,
} from "./session-input-composer/constants";
import { SessionComposerActionButton } from "./session-input-composer/SessionComposerActionButton";
import { SessionComposerBottomSheet } from "./session-input-composer/SessionComposerBottomSheet";
import { SessionComposerInputCard } from "./session-input-composer/SessionComposerInputCard";
import { SessionComposerLeadingChips } from "./session-input-composer/SessionComposerLeadingChips";
import { SessionComposerMeasurementLayer } from "./session-input-composer/SessionComposerMeasurementLayer";
import { SessionComposerSheetTrigger } from "./session-input-composer/SessionComposerSheetTrigger";
import { SessionComposerSlashCommandMenu } from "./session-input-composer/SessionComposerSlashCommandMenu";
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
type ComposerSheet = "model" | "runtime" | null;

/**
 * Session composer: a single-line-start liquid glass input next to a
 * separate send circle, with lightweight mode/config controls. Mounted by
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
  const channel = useEntityField("sessions", sessionId, "channel") as
    | { id: string }
    | null
    | undefined;
  const isOptimistic = useEntityField("sessions", sessionId, "_optimistic");

  const [text, setText] = useState("");
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [mode, setMode] = useState<ComposerMode>("code");
  const [height, setHeight] = useState(MIN_INPUT_HEIGHT);
  const [errorDraft, setErrorDraft] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [pastingImage, setPastingImage] = useState(false);
  const [focused, setFocused] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const [activeSheet, setActiveSheet] = useState<ComposerSheet>(null);

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
    setSelection({ start: draft.length, end: draft.length });
    setErrorDraft(draft);
    setErrorMessage(message);
  }, []);

  const onSuccess = useCallback(() => {
    setText("");
    setSelection({ start: 0, end: 0 });
    setErrorDraft(null);
    setErrorMessage(null);
  }, []);

  const { submit: runSubmit, sending } = useComposerSubmit({
    sessionId,
    isActive,
    onFailure,
    onSuccess,
  });
  const { commands: slashCommands } = useSlashCommands(sessionId);

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
  const activeSlashQuery = getActiveSlashCommandQuery(text, selection);
  const matchingSlashCommands = activeSlashQuery
    ? filterSlashCommands(slashCommands, activeSlashQuery.query)
    : [];
  const showSlashCommandMenu =
    inputFocused &&
    canInteract &&
    activeSlashQuery !== null &&
    matchingSlashCommands.length > 0;

  const {
    cardBorderAnimatedStyle,
    chipAnimatedStyle,
    chipTextAnimatedStyle,
    glassAnimatedProps,
    handleModeMeasure,
    handleModePress,
    modeIconTint,
    modeLabelVisible,
    modeWidthAnimatedStyle,
    resetChips,
  } = useSessionComposerChips({
    mode,
    setMode,
  });

  const {
    bridgeIcon,
    bridgeLabel,
    canChangeBridge,
    modelLabel,
  } = useSessionComposerConfig({
    connection,
    currentTool,
    hosting,
    isNotStarted,
    isOptimistic,
    model,
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

  const handleCloseSheet = useCallback(() => {
    setActiveSheet(null);
  }, []);

  const handleOpenModelSheet = useCallback(() => {
    if (!canInteract) return;
    void haptic.selection();
    Keyboard.dismiss();
    setActiveSheet("model");
  }, [canInteract]);

  const handleOpenRuntimeSheet = useCallback(() => {
    if (!canChangeBridge) return;
    void haptic.selection();
    Keyboard.dismiss();
    setActiveSheet("runtime");
  }, [canChangeBridge]);

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
    const next = Math.min(MAX_INPUT_HEIGHT, Math.max(MIN_INPUT_HEIGHT, contentHeight));
    setHeight((current) => (current === next ? current : next));
  }, []);

  const handleSend = useCallback(() => {
    if (!canInteract) return;

    if (trimmed === "/clear") {
      const channelId = channel?.id;
      if (channelId) {
        onSuccess();
        void createQuickSession(channelId);
        return;
      }
    }

    if (canSubmit) void runSubmit(trimmed, mode);
  }, [canInteract, canSubmit, channel?.id, mode, onSuccess, runSubmit, trimmed]);

  const handleSlashCommandSelect = useCallback((commandName: string) => {
    const next = insertSlashCommand(text, selection, commandName);
    setText(next.text);
    setSelection(next.selection);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [selection, text]);

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
        onModeMeasure={handleModeMeasure}
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
          {expanded && !hasSendable && !isActive ? (
            <SessionComposerLeadingChips
              canInteract={canInteract}
              currentTool={currentTool}
              mode={mode}
              modeIconTint={modeIconTint}
              modeLabelVisible={modeLabelVisible}
              modelLabel={modelLabel}
              chipAnimatedStyle={chipAnimatedStyle}
              chipTextAnimatedStyle={chipTextAnimatedStyle}
              glassAnimatedProps={glassAnimatedProps}
              modeWidthAnimatedStyle={modeWidthAnimatedStyle}
              onModePress={handleModePress}
              onOpenModelSheet={handleOpenModelSheet}
            />
          ) : null}

          <View style={styles.inputCardSlot}>
            {showSlashCommandMenu ? (
              <View style={styles.slashMenuOverlay}>
                <SessionComposerSlashCommandMenu
                  commands={matchingSlashCommands}
                  onSelect={(command) => handleSlashCommandSelect(command.name)}
                />
              </View>
            ) : null}

            <SessionComposerInputCard
              canInteract={canInteract}
              errorDraft={errorDraft}
              errorMessage={errorMessage}
              glassAnimatedProps={glassAnimatedProps}
              inputAnimatedStyle={inputAnimatedStyle}
              inputRef={inputRef}
              placeholder={placeholder}
              selection={selection}
              text={text}
              cardBorderAnimatedStyle={cardBorderAnimatedStyle}
              onBlur={handleBlur}
              onChangeText={handleChangeText}
              onContentHeightChange={handleContentHeightChange}
              onFocus={handleFocus}
              onRetry={handleRetry}
              onSelectionChange={setSelection}
            />
          </View>

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
              contentOpacity={canSubmit ? 1 : 0.35}
              disabled={!canSubmit}
              glassStyle={cardBorderAnimatedStyle}
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
          <View style={styles.bridgeRow}>
            <SessionComposerSheetTrigger
              label={bridgeLabel}
              accessibilityLabel={`Runtime: ${bridgeLabel}`}
              leading={
                <SymbolView
                  name={bridgeIcon}
                  size={16}
                  tintColor={theme.colors.mutedForeground}
                  resizeMode="scaleAspectFit"
                />
              }
              disabled={!canChangeBridge}
              onPress={handleOpenRuntimeSheet}
              showLabel={false}
            />
          </View>
        ) : null}
      </View>

      <SessionComposerBottomSheet
        visible={activeSheet !== null}
        onClose={handleCloseSheet}
      >
        {activeSheet === "model" ? (
          <SessionModelPickerSheetContent
            sessionId={sessionId}
            onClose={handleCloseSheet}
          />
        ) : null}
        {activeSheet === "runtime" ? (
          <SessionRuntimePickerSheetContent
            sessionId={sessionId}
            onClose={handleCloseSheet}
          />
        ) : null}
      </SessionComposerBottomSheet>
    </View>
  );
}
