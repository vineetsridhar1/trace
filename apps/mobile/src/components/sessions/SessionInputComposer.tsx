import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, View, type TextInput } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { File as ExpoFile } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import Animated, {
  Easing,
  LinearTransition,
  SlideInRight,
  SlideOutRight,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import {
  DISMISS_SESSION_MUTATION,
  generateUUID,
  hasSelectedSessionGroupRuntime,
  useEntityField,
} from "@trace/client-core";
import type { CodingTool, SessionConnection } from "@trace/gql";
import { useComposerSubmit, type ComposerMode } from "@/hooks/useComposerSubmit";
import { useClipboardImage } from "@/hooks/useClipboardImage";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useSlashCommands } from "@/hooks/useSlashCommands";
import { extensionForMimeType } from "@/lib/attachment-utils";
import { haptic } from "@/lib/haptics";
import { recordPerf } from "@/lib/perf";
import {
  type ComposerSelection,
  filterSlashCommands,
  getActiveSlashCommandQuery,
  insertSlashCommand,
} from "@/lib/slashCommands";
import { getClient } from "@/lib/urql";
import { createQuickSession } from "@/lib/createQuickSession";
import { useDraftsStore, type FileAttachment } from "@/stores/drafts";
import { useMobileUIStore } from "@/stores/ui";
import { alpha, useTheme } from "@/theme";
import { AttachmentBar } from "./AttachmentBar";
import { AttachmentPickerSheetContent } from "./AttachmentPickerSheetContent";
import { ComposerAttachButton } from "./ComposerAttachButton";
import { ComposerConnectionNotice } from "./ComposerConnectionNotice";
import { ComposerPasteButton } from "./ComposerPasteButton";
import { SessionModelPickerSheetContent } from "./SessionModelPickerSheetContent";
import { SessionRuntimePickerSheetContent } from "./SessionRuntimePickerSheetContent";
import {
  MAX_ATTACHMENTS,
  MAX_INPUT_HEIGHT,
  MIN_INPUT_HEIGHT,
} from "./session-input-composer/constants";
import { SessionComposerActionButton } from "./session-input-composer/SessionComposerActionButton";
import { SessionComposerBottomSheet } from "./session-input-composer/SessionComposerBottomSheet";
import { SessionComposerInputCard } from "./session-input-composer/SessionComposerInputCard";
import { SessionComposerLeadingChips } from "./session-input-composer/SessionComposerLeadingChips";
import { SessionComposerMeasurementLayer } from "./session-input-composer/SessionComposerMeasurementLayer";
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

const EMPTY_ATTACHMENTS: FileAttachment[] = [];
type ComposerSheet = "attach" | "model" | "runtime" | null;
const composerMotionEasing = Easing.inOut(Easing.ease);
const composerMotionDuration = 150;

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
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const resolvedBottomSafeAreaInset = bottomSafeAreaInset ?? insets.bottom;

  const agentStatus = useEntityField("sessions", sessionId, "agentStatus");
  const sessionStatus = useEntityField("sessions", sessionId, "sessionStatus");
  const worktreeDeleted = useEntityField("sessions", sessionId, "worktreeDeleted");
  const tool = useEntityField("sessions", sessionId, "tool") as string | null | undefined;
  const model = useEntityField("sessions", sessionId, "model") as string | null | undefined;
  const reasoningEffort = useEntityField("sessions", sessionId, "reasoningEffort") as
    | string
    | null
    | undefined;
  const hosting = useEntityField("sessions", sessionId, "hosting") as string | null | undefined;
  const connection = useEntityField("sessions", sessionId, "connection") as
    | SessionConnection
    | null
    | undefined;
  const workdir = useEntityField("sessions", sessionId, "workdir") as
    | string
    | null
    | undefined;
  const channel = useEntityField("sessions", sessionId, "channel") as
    | { id: string }
    | null
    | undefined;
  const sessionGroupId = useEntityField("sessions", sessionId, "sessionGroupId") as
    | string
    | null
    | undefined;
  const sessionGroupKind = useEntityField(
    "sessionGroups",
    sessionGroupId ?? "",
    "kind",
  ) as string | null | undefined;
  const groupConnection = useEntityField(
    "sessionGroups",
    sessionGroupId ?? "",
    "connection",
  ) as SessionConnection | null | undefined;
  const groupWorkdir = useEntityField(
    "sessionGroups",
    sessionGroupId ?? "",
    "workdir",
  ) as string | null | undefined;
  const isOptimistic = useEntityField("sessions", sessionId, "_optimistic");

  const [text, setText] = useState("");
  const [selection, setSelection] = useState<ComposerSelection>({ start: 0, end: 0 });
  const [selectionOverride, setSelectionOverride] = useState<ComposerSelection | null>(null);
  const [mode, setMode] = useState<ComposerMode>("code");
  const [height, setHeight] = useState(MIN_INPUT_HEIGHT);
  const [errorDraft, setErrorDraft] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [pastingImage, setPastingImage] = useState(false);
  const [focused, setFocused] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [pickingAttachment, setPickingAttachment] = useState(false);
  const [activeSheet, setActiveSheet] = useState<ComposerSheet>(null);

  const attachments = useDraftsStore((s) => s.attachments[sessionId] ?? EMPTY_ATTACHMENTS);
  const setAttachments = useDraftsStore((s) => s.setAttachments);

  const inputRef = useRef<TextInput>(null);
  const attachmentPickerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreKeyboardAfterSheetCloseRef = useRef(false);
  const modelSheetOpenedWithKeyboardRef = useRef(false);
  useEffect(() => {
    if (focusRequest == null) return;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [focusRequest]);
  useEffect(
    () => () => {
      if (attachmentPickerTimerRef.current) {
        clearTimeout(attachmentPickerTimerRef.current);
      }
    },
    [],
  );

  const applySelectionOverride = useCallback((next: ComposerSelection) => {
    setSelection(next);
    setSelectionOverride(next);
    requestAnimationFrame(() => {
      setSelectionOverride((current) =>
        current && current.start === next.start && current.end === next.end ? null : current,
      );
    });
  }, []);

  const isActive = agentStatus === "active";
  const isNotStarted = agentStatus === "not_started";
  const currentTool: CodingTool =
    tool === "codex" || tool === "pi" || tool === "antigravity" || tool === "cursor_composer"
      ? (tool as CodingTool)
      : "claude_code";
  const isTerminal =
    (worktreeDeleted === true || sessionStatus === "merged") && worktreeDeleted !== false;
  const isDisconnected = connection?.state === "disconnected";
  const canRetryConnection = connection?.canRetry === true;

  const onFailure = useCallback(
    (draft: string, message: string) => {
      setText(draft);
      const restoredSelection = { start: draft.length, end: draft.length };
      applySelectionOverride(restoredSelection);
      setErrorDraft(draft);
      setErrorMessage(message);
    },
    [applySelectionOverride],
  );

  const onSuccess = useCallback(() => {
    setText("");
    setHeight(MIN_INPUT_HEIGHT);
    const clearedSelection = { start: 0, end: 0 };
    applySelectionOverride(clearedSelection);
    setErrorDraft(null);
    setErrorMessage(null);
  }, [applySelectionOverride]);

  const { submit: runSubmit, sending } = useComposerSubmit({
    sessionId,
    isActive,
    onFailure,
    onSuccess,
  });
  const { commands: slashCommands } = useSlashCommands(sessionId);

  const trimmed = text.trim();
  const canInteract = !isTerminal && !sending && !stopping && !isDisconnected && !isOptimistic;
  const canSubmit = canInteract && (trimmed.length > 0 || attachments.length > 0);
  const canStop = isActive && !stopping;
  const canAttach = canInteract && !pickingAttachment && attachments.length < MAX_ATTACHMENTS;

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
    attachments.length === 0 &&
    !pastingImage;

  // Expanded controls should only show while the input is focused and the
  // software keyboard is up. Once the keyboard starts dismissing, fall back
  // to the collapsed row immediately instead of waiting for a later blur.
  const expanded = focused && keyboardVisible;
  const hasSendable = trimmed.length > 0 || attachments.length > 0;
  const showSend = (isActive && focused) || (!isActive && hasSendable);
  const showStop = isActive;
  const showFocusedStop = isActive && focused;
  const showLeadingControls = !hasSendable && !isActive;
  const activeSlashQuery = getActiveSlashCommandQuery(text, selection);
  const matchingSlashCommands = activeSlashQuery
    ? filterSlashCommands(slashCommands, activeSlashQuery.query)
    : [];
  const showSlashCommandMenu =
    inputFocused && canInteract && activeSlashQuery !== null && matchingSlashCommands.length > 0;

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

  const { modelLabel } = useSessionComposerConfig({
    connection,
    currentTool,
    hosting,
    isNotStarted,
    isOptimistic,
    model,
    reasoningEffort,
    sessionId,
    tool,
  });
  const groupHasSelectedBridge = hasSelectedSessionGroupRuntime(
    groupConnection === undefined ? connection : groupConnection,
    groupWorkdir === undefined ? workdir : groupWorkdir,
  );
  const cloudOnlyGeneratedSession = sessionGroupKind === "app" || sessionGroupKind === "design";
  const canChangeBridge =
    isNotStarted && !isOptimistic && !cloudOnlyGeneratedSession && !groupHasSelectedBridge;

  const inputHeight = useSharedValue(MIN_INPUT_HEIGHT);
  useEffect(() => {
    inputHeight.value = withTiming(height, {
      duration: theme.motion.durations.fast,
    });
  }, [height, inputHeight, theme.motion.durations.fast]);
  const inputAnimatedStyle = useAnimatedStyle(() => ({ height: inputHeight.value }));
  const composerRowTransition = reducedMotion
    ? undefined
    : LinearTransition.duration(composerMotionDuration).easing(composerMotionEasing);
  const trailingActionEnter = reducedMotion
    ? undefined
    : SlideInRight.duration(composerMotionDuration).easing(composerMotionEasing);
  const trailingActionExit = reducedMotion
    ? undefined
    : SlideOutRight.duration(composerMotionDuration).easing(composerMotionEasing);

  const handleCloseSheet = useCallback(() => {
    setActiveSheet(null);
  }, []);

  const runAfterAttachmentSheetCloses = useCallback(
    (launchPicker: () => void) => {
      handleCloseSheet();
      if (attachmentPickerTimerRef.current) {
        clearTimeout(attachmentPickerTimerRef.current);
      }
      attachmentPickerTimerRef.current = setTimeout(() => {
        attachmentPickerTimerRef.current = null;
        launchPicker();
      }, theme.motion.durations.fast + 80);
    },
    [handleCloseSheet, theme.motion.durations.fast],
  );

  const handleOpenModelSheet = useCallback(() => {
    if (!canInteract) return;
    void haptic.selection();
    modelSheetOpenedWithKeyboardRef.current = keyboardVisible;
    Keyboard.dismiss();
    setActiveSheet("model");
  }, [canInteract, keyboardVisible]);

  const handleOpenAttachmentSheet = useCallback(() => {
    if (!canAttach) return;
    void haptic.selection();
    Keyboard.dismiss();
    setActiveSheet("attach");
  }, [canAttach]);

  const handleModelSelected = useCallback(() => {
    restoreKeyboardAfterSheetCloseRef.current = modelSheetOpenedWithKeyboardRef.current;
  }, []);

  const handleSheetDismissed = useCallback(() => {
    if (!restoreKeyboardAfterSheetCloseRef.current) return;
    restoreKeyboardAfterSheetCloseRef.current = false;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

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
    setSelectionOverride(null);
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

    if (currentTool === "pi" && trimmed === "/login") {
      if (!sessionGroupId) {
        setErrorDraft(trimmed);
        setErrorMessage("Cannot open Pi login terminal for this session");
        return;
      }
      useMobileUIStore.getState().queueTerminalInitialCommand(sessionId, "pi\n/login");
      onSuccess();
      void haptic.selection();
      Keyboard.dismiss();
      router.push(`/sessions/${sessionGroupId}/${sessionId}?pane=terminal`);
      return;
    }

    if (!canSubmit) return;
    if (canChangeBridge) {
      void haptic.selection();
      Keyboard.dismiss();
      setActiveSheet("runtime");
      return;
    }
    void runSubmit(trimmed, mode);
  }, [
    canChangeBridge,
    canInteract,
    canSubmit,
    channel?.id,
    currentTool,
    mode,
    onSuccess,
    router,
    runSubmit,
    sessionGroupId,
    sessionId,
    trimmed,
  ]);

  const handleSendAfterRuntimeSelect = useCallback(async () => {
    if (!canSubmit) return;
    await runSubmit(trimmed, mode);
  }, [canSubmit, mode, runSubmit, trimmed]);

  const handleSlashCommandSelect = useCallback(
    (commandName: string) => {
      const next = insertSlashCommand(text, selection, commandName);
      setText(next.text);
      applySelectionOverride(next.selection);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    },
    [applySelectionOverride, selection, text],
  );

  const handlePasteImage = useCallback(async () => {
    if (pastingImage || attachments.length >= MAX_ATTACHMENTS) return;
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
      const extension = extensionForMimeType(mimeType);
      const attachment: FileAttachment = {
        id: generateUUID(),
        filename: `pasted-image-${Date.now()}.${extension}`,
        mimeType,
        base64: rawBase64,
        previewUri: result.data,
        width: result.size?.width ?? null,
        height: result.size?.height ?? null,
        s3Key: null,
        uploading: false,
      };
      setAttachments(sessionId, (prev) => {
        if (prev.length >= MAX_ATTACHMENTS) return prev;
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
  }, [attachments.length, dismissClipboard, pastingImage, sessionId, setAttachments]);

  const launchImagePicker = useCallback(async () => {
    if (pickingAttachment || attachments.length >= MAX_ATTACHMENTS) return;
    setPickingAttachment(true);
    void haptic.selection();
    try {
      const remaining = MAX_ATTACHMENTS - attachments.length;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.9,
        allowsMultipleSelection: true,
        selectionLimit: remaining,
      });
      if (result.canceled) return;
      const nextAttachments: FileAttachment[] = result.assets.map((asset) => {
        const mimeType = asset.mimeType ?? "image/jpeg";
        return {
          id: generateUUID(),
          filename: imageFilename(asset, mimeType),
          mimeType,
          fileUri: asset.uri,
          previewUri: asset.uri,
          size: asset.fileSize,
          width: asset.width || null,
          height: asset.height || null,
          s3Key: null,
          uploading: false,
        };
      });
      if (nextAttachments.length === 0) return;
      setAttachments(sessionId, (prev) => {
        const room = MAX_ATTACHMENTS - prev.length;
        if (room <= 0) return prev;
        return [...prev, ...nextAttachments.slice(0, room)];
      });
      void haptic.light();
    } catch (err) {
      void haptic.error();
      console.warn("[composer] image library pick failed", err);
    } finally {
      setPickingAttachment(false);
    }
  }, [attachments.length, pickingAttachment, sessionId, setAttachments]);

  const launchFilePicker = useCallback(async () => {
    if (pickingAttachment || attachments.length >= MAX_ATTACHMENTS) return;
    setPickingAttachment(true);
    void haptic.selection();
    try {
      const remaining = MAX_ATTACHMENTS - attachments.length;
      let nextAttachments: FileAttachment[];
      try {
        const DocumentPicker = await import("expo-document-picker");
        const result = await DocumentPicker.getDocumentAsync({
          type: "*/*",
          multiple: true,
          copyToCacheDirectory: true,
        });
        if (result.canceled) return;
        nextAttachments = result.assets.slice(0, remaining).map((asset) => ({
          id: generateUUID(),
          filename: asset.name || filenameFromUri(asset.uri, "attachment"),
          mimeType: asset.mimeType || "application/octet-stream",
          fileUri: asset.uri,
          size: asset.size,
          width: null,
          height: null,
          s3Key: null,
          uploading: false,
        }));
      } catch (documentPickerError) {
        console.warn(
          "[composer] document picker unavailable, using file-system picker",
          documentPickerError,
        );
        const picked = await ExpoFile.pickFileAsync();
        const pickedFiles = Array.isArray(picked) ? picked : [picked];
        nextAttachments = pickedFiles.slice(0, remaining).map((file) => ({
          id: generateUUID(),
          filename: filenameFromUri(file.uri, "attachment"),
          mimeType: file.type || "application/octet-stream",
          fileUri: file.uri,
          size: file.size > 0 ? file.size : undefined,
          width: null,
          height: null,
          s3Key: null,
          uploading: false,
        }));
      }
      if (nextAttachments.length === 0) return;
      setAttachments(sessionId, (prev) => {
        const room = MAX_ATTACHMENTS - prev.length;
        if (room <= 0) return prev;
        return [...prev, ...nextAttachments.slice(0, room)];
      });
      void haptic.light();
    } catch (err) {
      void haptic.error();
      console.warn("[composer] file picker failed", err);
    } finally {
      setPickingAttachment(false);
    }
  }, [attachments.length, pickingAttachment, sessionId, setAttachments]);

  const handlePickFromLibrary = useCallback(() => {
    runAfterAttachmentSheetCloses(() => void launchImagePicker());
  }, [launchImagePicker, runAfterAttachmentSheetCloses]);

  const handlePickFiles = useCallback(() => {
    runAfterAttachmentSheetCloses(() => void launchFilePicker());
  }, [launchFilePicker, runAfterAttachmentSheetCloses]);

  const handleRemoveAttachment = useCallback(
    (id: string) => {
      setAttachments(sessionId, (prev) => prev.filter((attachment) => attachment.id !== id));
    },
    [sessionId, setAttachments],
  );

  const handleRetry = useCallback(() => {
    if (errorDraft !== null && !isTerminal) void runSubmit(errorDraft, mode);
  }, [errorDraft, isTerminal, mode, runSubmit]);

  const handleSelectionChange = useCallback((next: ComposerSelection) => {
    setSelection(next);
    setSelectionOverride(null);
  }, []);

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
    : isTerminal
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
      <SessionComposerMeasurementLayer onModeMeasure={handleModeMeasure} />

      {isDisconnected ? (
        <ComposerConnectionNotice sessionId={sessionId} canRetry={canRetryConnection} />
      ) : null}

      <ComposerPasteButton visible={showPasteButton} onPress={() => void handlePasteImage()} />
      <AttachmentBar attachments={attachments} onRemove={handleRemoveAttachment} />

      <View style={styles.composerStack}>
        <Animated.View layout={composerRowTransition} style={styles.inputActionRow}>
          {showLeadingControls ? (
            <Animated.View layout={composerRowTransition}>
              <SessionComposerLeadingChips
                canInteract={canInteract}
                currentTool={currentTool}
                mode={mode}
                modeIconTint={modeIconTint}
                modeLabelVisible={modeLabelVisible}
                modelLabel={modelLabel}
                showModeChip={expanded}
                chipAnimatedStyle={chipAnimatedStyle}
                chipTextAnimatedStyle={chipTextAnimatedStyle}
                glassAnimatedProps={glassAnimatedProps}
                modeWidthAnimatedStyle={modeWidthAnimatedStyle}
                onModePress={handleModePress}
                onOpenModelSheet={handleOpenModelSheet}
              />
            </Animated.View>
          ) : null}

          <Animated.View layout={composerRowTransition} style={styles.inputCardSlot}>
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
              inputHeight={height}
              inputAnimatedStyle={inputAnimatedStyle}
              inputRef={inputRef}
              layoutTransition={composerRowTransition}
              placeholder={placeholder}
              selection={selectionOverride}
              text={text}
              cardBorderAnimatedStyle={cardBorderAnimatedStyle}
              onBlur={handleBlur}
              onChangeText={handleChangeText}
              onContentHeightChange={handleContentHeightChange}
              onFocus={handleFocus}
              onRetry={handleRetry}
              onSelectionChange={handleSelectionChange}
            />
          </Animated.View>

          {!showFocusedStop ? (
            <Animated.View layout={composerRowTransition} style={styles.attachButtonSlot}>
              <ComposerAttachButton enabled={canAttach} onPress={handleOpenAttachmentSheet} />
            </Animated.View>
          ) : null}

          {showSend ? (
            <Animated.View
              layout={composerRowTransition}
              entering={trailingActionEnter}
              exiting={trailingActionExit}
            >
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
            </Animated.View>
          ) : null}

          {showStop ? (
            <Animated.View
              layout={composerRowTransition}
              entering={trailingActionEnter}
              exiting={trailingActionExit}
            >
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
            </Animated.View>
          ) : null}
        </Animated.View>
      </View>

      <SessionComposerBottomSheet
        visible={activeSheet !== null}
        onClose={handleCloseSheet}
        onDismissed={handleSheetDismissed}
      >
        {activeSheet === "attach" ? (
          <AttachmentPickerSheetContent
            disabled={!canAttach}
            onPickFiles={() => void handlePickFiles()}
            onPickImages={() => void handlePickFromLibrary()}
          />
        ) : null}
        {activeSheet === "model" ? (
          <SessionModelPickerSheetContent
            sessionId={sessionId}
            onClose={handleCloseSheet}
            onSelectModel={handleModelSelected}
          />
        ) : null}
        {activeSheet === "runtime" ? (
          <SessionRuntimePickerSheetContent
            sessionId={sessionId}
            onClose={handleCloseSheet}
            onSelectRuntime={handleSendAfterRuntimeSelect}
          />
        ) : null}
      </SessionComposerBottomSheet>
    </View>
  );
}

function imageFilename(asset: ImagePicker.ImagePickerAsset, mimeType: string): string {
  const extension = extensionForMimeType(mimeType);
  const fallback = `image-${Date.now()}.${extension}`;
  const filename = asset.fileName?.trim() || filenameFromUri(asset.uri, fallback);
  return filenameHasExtension(filename) ? filename : `${filename}.${extension}`;
}

function filenameFromUri(uri: string, fallback: string): string {
  const cleanUri = uri.split("?")[0] ?? uri;
  let decoded = cleanUri;
  try {
    decoded = decodeURIComponent(cleanUri);
  } catch {
    decoded = cleanUri;
  }
  const filename = decoded.split("/").pop()?.trim();
  return filename || fallback;
}

function filenameHasExtension(filename: string): boolean {
  return /\.[a-z0-9]+$/i.test(filename);
}
