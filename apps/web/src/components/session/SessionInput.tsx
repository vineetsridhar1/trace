import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { LayoutTemplate, Paperclip, Send, Square } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import {
  isSessionPreparing,
  isSessionRuntimeStartingUp,
  useEntityField,
  useEntityStore,
  type SessionEntity,
} from "@trace/client-core";
import { client } from "../../lib/urql";
import {
  CREATE_TERMINAL_MUTATION,
  SEND_SESSION_MESSAGE_MUTATION,
  QUEUE_SESSION_MESSAGE_MUTATION,
} from "@trace/client-core";
import { type InteractionMode, MODE_CYCLE, MODE_CONFIG, wrapPrompt } from "./interactionModes";
import { AiLoadingIndicator } from "./AiLoadingIndicator";
import { SessionInputOptions } from "./SessionInputOptions";
import { isDisconnected, canSendMessage, canQueueMessage } from "./sessionStatus";
import { SessionRecoveryPanel } from "./SessionRecoveryPanel";
import { getModelLabel } from "./modelOptions";
import { getToolLabel } from "./picker/pickerShared";
import { TraceLoader } from "../ui/trace-loader";
import { cn } from "../../lib/utils";
import { toast } from "sonner";
import {
  optimisticallyInsertSessionMessage,
  reconcileOptimisticSessionMessage,
  removeOptimisticSessionMessage,
} from "@trace/client-core";
import {
  ChatEditor,
  type ChatEditorHandle,
  type ChatEditorSubmitOptions,
} from "../chat/ChatEditor";
import { useSlashCommands } from "./useSlashCommands";
import { createQuickSession } from "../../lib/create-quick-session";
import { showToolNotInstalledToast } from "../../lib/coding-tool-install";
import { useUIStore } from "../../stores/ui";
import { ImageAttachmentBar, type FileAttachment } from "./ImageAttachmentBar";
import { uploadFile } from "../../lib/upload";
import { useAddAttachments, MAX_ATTACHMENTS } from "./useAddAttachments";
import { useAuthStore } from "@trace/client-core";
import { useDraftsStore } from "../../stores/drafts";
import { useComposerStore } from "../../stores/composer";
import { useTerminalStore } from "../../stores/terminal";
import { useAttachmentOpen } from "./AttachmentOpenContext";
import { BridgeAccessNotice } from "./BridgeAccessNotice";
import { isBridgeInteractionAllowed, type BridgeRuntimeAccessInfo } from "./useBridgeRuntimeAccess";
import {
  getSessionEmptyStateContent,
  kindSupportsDesignImplementation,
} from "./sessionEmptyState";
import { DesignPickerDialog } from "./DesignPickerDialog";

const EMPTY_ATTACHMENTS: FileAttachment[] = [];

export function SessionInput({
  sessionId,
  onStop,
  bridgeAccess,
  sessionGroupId,
  onAccessRequested,
}: {
  sessionId: string;
  onStop: () => void;
  bridgeAccess: BridgeRuntimeAccessInfo | null;
  sessionGroupId?: string | null;
  onAccessRequested?: () => void | Promise<void>;
}) {
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus") as string | undefined;
  const model = useEntityField("sessions", sessionId, "model") as string | undefined;
  const tool = useEntityField("sessions", sessionId, "tool") as string | undefined;
  const connection = useEntityField("sessions", sessionId, "connection") as
    | Record<string, unknown>
    | null
    | undefined;
  const hosting = useEntityField("sessions", sessionId, "hosting") as string | undefined;
  const sessionStatus = useEntityField("sessions", sessionId, "sessionStatus") as
    | string
    | undefined;
  const workdir = useEntityField("sessions", sessionId, "workdir") as string | null | undefined;
  const rawLastUserMessageAt = useEntityField("sessions", sessionId, "lastUserMessageAt") as
    | string
    | null
    | undefined;
  const lastMessageAt = useEntityField("sessions", sessionId, "lastMessageAt") as
    | string
    | null
    | undefined;
  const worktreeDeleted = useEntityField("sessions", sessionId, "worktreeDeleted") as
    | boolean
    | undefined;
  const isOptimistic = useEntityField("sessions", sessionId, "_optimistic") as boolean | undefined;
  const groupKind = useEntityField("sessionGroups", sessionGroupId ?? "", "kind") as
    | string
    | null
    | undefined;
  const images = useDraftsStore((s) => s.drafts[sessionId]?.images ?? EMPTY_ATTACHMENTS);
  const openAttachment = useAttachmentOpen();
  const setDraftImages = useDraftsStore((s) => s.setDraftImages);
  const setDraftText = useDraftsStore((s) => s.setDraftText);
  const prefill = useComposerStore((s) => s.prefillBySession[sessionId]);
  const consumePrefill = useComposerStore((s) => s.consumePrefill);
  const [initialDraftHtml] = useState(
    () => useDraftsStore.getState().drafts[sessionId]?.html ?? "",
  );
  const [hasContent, setHasContent] = useState(
    () => (useDraftsStore.getState().drafts[sessionId]?.text ?? "").trim().length > 0,
  );
  const [mode, setMode] = useState<InteractionMode>("code");
  const [isSending, setIsSending] = useState(false);
  const [showDesignPicker, setShowDesignPicker] = useState(false);
  const isSendingRef = useRef(false);
  const hasAutoFocusedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<ChatEditorHandle>(null);
  const isActive = agentStatus === "active";
  const isNotStarted = agentStatus === "not_started";
  const disconnected = isDisconnected(connection);
  const preparing =
    isSessionPreparing({
      agentStatus,
      sessionStatus,
      workdir,
      lastUserMessageAt: rawLastUserMessageAt,
      lastMessageAt,
      connection,
    }) ||
    // Only trust the connection's startup state before the workspace exists.
    // Once workdir is set the runtime is demonstrably up, so a lagging
    // connection.state (e.g. app sessions whose "connected" event arrives late)
    // must not keep showing "Preparing workspace…".
    (!workdir && isSessionRuntimeStartingUp(connection));
  const canQueue = canQueueMessage(agentStatus, worktreeDeleted);
  const bridgeInteractionAllowed = hosting === "cloud" || isBridgeInteractionAllowed(bridgeAccess);
  const canSend =
    bridgeInteractionAllowed &&
    !isOptimistic &&
    (isNotStarted || canSendMessage(agentStatus, connection, worktreeDeleted) || canQueue);
  const displayModel = model ? getModelLabel(model) : getToolLabel(tool ?? "claude_code");

  const lastUserMessageAt = isActive ? (rawLastUserMessageAt ?? undefined) : undefined;

  const slashCommands = useSlashCommands(sessionId);

  useEffect(() => {
    hasAutoFocusedRef.current = false;
  }, [sessionId]);

  useEffect(() => {
    if (hasAutoFocusedRef.current || !canSend || isSending) return;
    hasAutoFocusedRef.current = true;
    const frame = requestAnimationFrame(() => editorRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [canSend, isSending, sessionId]);

  // Cmd/Ctrl+L focuses the composer from anywhere in the session view.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      if (e.key !== "l" && e.key !== "L") return;
      if (!canSend || isSending) return;
      e.preventDefault();
      editorRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canSend, isSending]);

  // Apply a starter prompt requested from elsewhere (e.g. the empty-state chips).
  // Do the work synchronously, then consume: `submit()` reads the text we just set
  // straight from the editor, and clearing the request afterward just re-runs this
  // effect as a no-op. If `send` is set the composer submits immediately; otherwise
  // the text stays for the user to edit.
  useEffect(() => {
    if (!prefill) return;
    const editor = editorRef.current;
    if (editor) {
      editor.setText(prefill.text);
      if (prefill.send) {
        void editor.submit();
      } else {
        editor.focus();
      }
    }
    consumePrefill(sessionId);
  }, [prefill, consumePrefill, sessionId]);

  const cycleMode = useCallback(() => {
    setMode((prev: InteractionMode) => {
      const idx = MODE_CYCLE.indexOf(prev);
      return MODE_CYCLE[(idx + 1) % MODE_CYCLE.length];
    });
  }, []);

  const addAttachments = useAddAttachments(sessionId);

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      addAttachments(Array.from(event.currentTarget.files ?? []));
      event.currentTarget.value = "";
    },
    [addAttachments],
  );

  const handleOpenAttachment = useCallback(
    (attachment: FileAttachment) => {
      openAttachment?.({
        sessionId,
        attachmentId: attachment.id,
        fileName: attachment.file.name || "Attachment",
      });
    },
    [openAttachment, sessionId],
  );

  const handleRemoveImage = useCallback(
    (id: string) => {
      setDraftImages(sessionId, (prev) => {
        const img = prev.find((i) => i.id === id);
        if (img) URL.revokeObjectURL(img.previewUrl);
        return prev.filter((i) => i.id !== id);
      });
    },
    [sessionId, setDraftImages],
  );

  const handleSubmit = useCallback(
    async (_html: string, text: string, options?: ChatEditorSubmitOptions) => {
      if (isSendingRef.current) return;
      if ((!text && images.length === 0) || !canSend) return;
      const shouldSteer = options?.metaKey === true || options?.ctrlKey === true;

      if (text === "/clear") {
        const channelId = useUIStore.getState().activeChannelId;
        if (channelId) {
          void createQuickSession(channelId);
        }
        return;
      }

      if (tool === "pi" && text === "/login") {
        if (!sessionGroupId) {
          toast.error("Cannot open Pi login terminal for this session");
          return;
        }
        isSendingRef.current = true;
        setIsSending(true);
        try {
          const result = await client
            .mutation(CREATE_TERMINAL_MUTATION, { sessionId, cols: 80, rows: 24 })
            .toPromise();

          if (result.error) {
            throw result.error;
          }

          const terminal = result.data?.createTerminal as { id: string } | null | undefined;
          if (!terminal) {
            throw new Error("Failed to open terminal");
          }

          useTerminalStore
            .getState()
            .addTerminal(terminal.id, sessionId, sessionGroupId, "connecting", {
              customName: "Pi Login",
              initialCommand: "pi\n/login",
              submitInitialCommand: false,
            });

          const ui = useUIStore.getState();
          ui.setActiveSessionId(sessionId);
          ui.setActiveTerminalId(terminal.id);
          ui.setShowTerminalPanel(true);
          setDraftText(sessionId, "", "");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to open Pi login terminal");
          throw error;
        } finally {
          isSendingRef.current = false;
          setIsSending(false);
        }
        return;
      }

      isSendingRef.current = true;
      setIsSending(true);
      let shouldRefocusAfterQueue = false;
      try {
        const savedImages = [...images];
        const imagePreviewUrls = savedImages.map((img) => img.previewUrl);
        const wrappedText = !text ? "" : text.startsWith("/") ? text : wrapPrompt(mode, text);

        let imageKeys: string[] = [];
        const savedIds = new Set(savedImages.map((img) => img.id));
        if (savedImages.length > 0) {
          setDraftImages(sessionId, (prev) =>
            prev.map((img) => (savedIds.has(img.id) ? { ...img, uploading: true } : img)),
          );
          const orgId = useAuthStore.getState().activeOrgId;
          try {
            imageKeys = await Promise.all(
              savedImages.map((img) => uploadFile(img.file, orgId ?? undefined)),
            );
          } catch (error) {
            setDraftImages(sessionId, (prev) =>
              prev.map((img) => (savedIds.has(img.id) ? { ...img, uploading: false } : img)),
            );
            toast.error(error instanceof Error ? error.message : "Failed to upload file");
            throw error;
          }
        }

        if (canQueue && !shouldSteer) {
          try {
            const result = await client
              .mutation(QUEUE_SESSION_MESSAGE_MUTATION, {
                sessionId,
                text: wrappedText,
                attachmentKeys: imageKeys.length > 0 ? imageKeys : undefined,
                interactionMode: mode === "code" ? undefined : mode,
              })
              .toPromise();

            if (result.error) {
              throw result.error;
            }

            setDraftImages(sessionId, (prev) => prev.filter((img) => !savedIds.has(img.id)));
            for (const img of savedImages) URL.revokeObjectURL(img.previewUrl);
            useComposerStore.getState().requestScrollToBottom(sessionId);
            shouldRefocusAfterQueue = true;
          } catch (error) {
            setDraftImages(sessionId, (prev) =>
              prev.map((img) => (savedIds.has(img.id) ? { ...img, uploading: false } : img)),
            );
            toast.error(error instanceof Error ? error.message : "Failed to queue message");
            throw error;
          }
          return;
        }

        let rollbackStartupPatch: (() => void) | null = null;
        const startsDeferredRuntime = isNotStarted && hosting === "cloud";
        if (startsDeferredRuntime) {
          const previous = useEntityStore.getState().sessions[sessionId];
          useEntityStore.getState().patch("sessions", sessionId, {
            agentStatus: "active",
            sessionStatus: "in_progress",
            connection: {
              ...(connection ?? {}),
              state: "requested",
            } as SessionEntity["connection"],
          });
          rollbackStartupPatch = () => {
            if (!previous) return;
            useEntityStore.getState().patch("sessions", sessionId, {
              agentStatus: previous.agentStatus,
              sessionStatus: previous.sessionStatus,
              connection: previous.connection,
            });
          };
        }

        const { eventId: tempEventId, clientMutationId } = optimisticallyInsertSessionMessage(
          sessionId,
          wrappedText,
          imageKeys.length > 0 || startsDeferredRuntime
            ? {
                ...(startsDeferredRuntime ? { deliveryStatus: "pending_runtime" as const } : {}),
                ...(imageKeys.length > 0 ? { imageKeys, imagePreviewUrls } : {}),
              }
            : undefined,
        );
        useComposerStore.getState().requestScrollToBottom(sessionId);

        setDraftImages(sessionId, (prev) => prev.filter((img) => !savedIds.has(img.id)));

        try {
          const result = await client
            .mutation(SEND_SESSION_MESSAGE_MUTATION, {
              sessionId,
              text: wrappedText,
              attachmentKeys: imageKeys.length > 0 ? imageKeys : undefined,
              interactionMode: mode === "code" ? undefined : mode,
              clientMutationId,
            })
            .toPromise();

          if (result.error) {
            throw result.error;
          }

          const realEventId = result.data?.sendSessionMessage?.id;
          if (!realEventId) {
            throw new Error("Failed to send message");
          }

          reconcileOptimisticSessionMessage(sessionId, tempEventId, realEventId);
          for (const img of savedImages) URL.revokeObjectURL(img.previewUrl);
        } catch (error) {
          removeOptimisticSessionMessage(sessionId, tempEventId);
          rollbackStartupPatch?.();
          setDraftImages(sessionId, (prev) => [
            ...savedImages.map((img) => ({ ...img, uploading: false })),
            ...prev,
          ]);
          if (!showToolNotInstalledToast(error)) {
            toast.error(error instanceof Error ? error.message : "Failed to send message");
          }
          throw error;
        }
      } finally {
        isSendingRef.current = false;
        setIsSending(false);
        if (shouldRefocusAfterQueue) {
          requestAnimationFrame(() => editorRef.current?.focus());
        }
      }
    },
    [
      sessionId,
      sessionGroupId,
      mode,
      canSend,
      canQueue,
      images,
      isNotStarted,
      hosting,
      connection,
      tool,
      setDraftText,
    ],
  );

  const handleQueueSubmit = useCallback(() => {
    void editorRef.current?.submit();
  }, []);

  // If the user has bridge access (owner or granted), a disconnected session
  // belongs to the recovery panel — not the permission prompt. Non-owners
  // without access always see the permission prompt so they can request
  // access, whether the bridge is online or offline.
  if (bridgeInteractionAllowed && disconnected && !isNotStarted) {
    return <SessionRecoveryPanel sessionId={sessionId} connection={connection} />;
  }

  if (!bridgeInteractionAllowed && !isNotStarted) {
    return (
      <div className="border-t px-4 py-3">
        <BridgeAccessNotice
          access={bridgeAccess}
          sessionGroupId={sessionGroupId ?? null}
          onRequested={onAccessRequested}
        />
      </div>
    );
  }
  const placeholder = worktreeDeleted
    ? "Worktree deleted. This session is read-only."
    : isOptimistic
      ? "Creating session..."
      : isActive
        ? "Queue a message..."
        : isNotStarted
          ? getSessionEmptyStateContent(groupKind).placeholder
          : "Send a message...";

  return (
    <div className="shrink-0 bg-background px-4 pb-8">
      <DesignPickerDialog
        sessionId={sessionId}
        open={showDesignPicker}
        onOpenChange={setShowDesignPicker}
      />
      <div className="relative mx-auto w-[90%]">
        {preparing && (
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <TraceLoader size={12} showLabel={false} className="shrink-0" />
            <span>Preparing workspace…</span>
          </div>
        )}
        <AnimatePresence initial={false}>
          {isActive && (
            <AiLoadingIndicator
              key="ai-loading-indicator"
              model={displayModel}
              startedAt={lastUserMessageAt}
            />
          )}
        </AnimatePresence>
        <div
          className={cn(
            "relative rounded-2xl border bg-surface-mid px-2 pt-2 shadow-sm transition-colors focus-within:ring-1 focus-within:ring-border",
            MODE_CONFIG[mode as InteractionMode].inputBorder,
          )}
        >
        {!hasContent && (
          <span className="pointer-events-none absolute right-3 top-2 text-[11px] text-muted-foreground">
            <kbd className="font-sans">⌘L</kbd> to focus
          </span>
        )}
        <ImageAttachmentBar
          attachments={images}
          onRemove={handleRemoveImage}
          onOpenAttachment={handleOpenAttachment}
        />
        <div className="session-editor">
          <ChatEditor
            ref={editorRef}
            initialHtml={initialDraftHtml}
            onSubmit={handleSubmit}
            placeholder={placeholder}
            disabled={!canSend || isSending}
            slashCommands={slashCommands.commands}
            onShiftTab={cycleMode}
            onPasteFiles={addAttachments}
            hasAttachments={images.length > 0}
            onChange={(text: string, html: string) => {
              setHasContent(text.trim().length > 0);
              setDraftText(sessionId, text, html);
            }}
          />
        </div>
        <div className="@container flex items-center gap-1 pb-2 pl-1 pr-2 pt-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!canSend || isSending || images.length >= MAX_ATTACHMENTS}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            title="Attach files"
          >
            <Paperclip size={16} />
          </button>
          {kindSupportsDesignImplementation(groupKind) && (
            <button
              onClick={() => setShowDesignPicker(true)}
              disabled={!canSend || isSending || isActive}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              title="Implement a design"
            >
              <LayoutTemplate size={16} />
            </button>
          )}
          <SessionInputOptions
            sessionId={sessionId}
            mode={mode}
            onModeChange={cycleMode}
            isActive={isActive}
          />
          <div className="flex-1" />
          {isActive ? (
            <button
              onClick={onStop}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
              title="Stop"
            >
              <Square size={15} />
            </button>
          ) : (
            <button
              onClick={handleQueueSubmit}
              disabled={(!hasContent && images.length === 0) || !canSend || isSending}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
              title="Send"
            >
              <Send size={15} />
            </button>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
