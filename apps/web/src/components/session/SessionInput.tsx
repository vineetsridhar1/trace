import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Cloud, Monitor, Paperclip, Send, Square } from "lucide-react";
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
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
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
import { useTerminalStore } from "../../stores/terminal";
import { useAttachmentOpen } from "./AttachmentOpenContext";
import { BridgeAccessNotice } from "./BridgeAccessNotice";
import { isBridgeInteractionAllowed, type BridgeRuntimeAccessInfo } from "./useBridgeRuntimeAccess";

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
  const images = useDraftsStore((s) => s.drafts[sessionId]?.images ?? EMPTY_ATTACHMENTS);
  const openAttachment = useAttachmentOpen();
  const setDraftImages = useDraftsStore((s) => s.setDraftImages);
  const setDraftText = useDraftsStore((s) => s.setDraftText);
  const [initialDraftHtml] = useState(
    () => useDraftsStore.getState().drafts[sessionId]?.html ?? "",
  );
  const [hasContent, setHasContent] = useState(
    () => (useDraftsStore.getState().drafts[sessionId]?.text ?? "").trim().length > 0,
  );
  const [mode, setMode] = useState<InteractionMode>("code");
  const [isSending, setIsSending] = useState(false);
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
    }) || isSessionRuntimeStartingUp(connection);
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
          ? "What should the agent work on?"
          : "Send a message...";

  return (
    <div
      className={cn(
        "shrink-0 border-t px-4 py-3 transition-colors",
        MODE_CONFIG[mode as InteractionMode].containerBorder,
      )}
    >
      {preparing && (
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <TraceLoader size={12} showLabel={false} className="shrink-0" />
          <span>Preparing workspace…</span>
        </div>
      )}
      <ImageAttachmentBar
        attachments={images}
        onRemove={handleRemoveImage}
        onOpenAttachment={handleOpenAttachment}
      />
      <AnimatePresence initial={false}>
        {isActive && (
          <AiLoadingIndicator
            key="ai-loading-indicator"
            model={displayModel}
            startedAt={lastUserMessageAt}
          />
        )}
      </AnimatePresence>
      <div className="flex items-center gap-2">
        {!isNotStarted && (
          <Tooltip>
            <TooltipTrigger className="flex items-center text-muted-foreground">
              {hosting === "cloud" ? (
                <Cloud
                  size={14}
                  className={cn(
                    "transition-colors",
                    MODE_CONFIG[mode as InteractionMode].iconColor,
                  )}
                />
              ) : (
                <Monitor
                  size={14}
                  className={cn(
                    "transition-colors",
                    MODE_CONFIG[mode as InteractionMode].iconColor,
                  )}
                />
              )}
            </TooltipTrigger>
            <TooltipContent>
              {hosting === "cloud"
                ? "Cloud"
                : connection && typeof connection === "object" && "runtimeLabel" in connection
                  ? ((connection.runtimeLabel as string) ?? "Local")
                  : "Local"}
            </TooltipContent>
          </Tooltip>
        )}
        <div
          className={cn(
            "flex-1 rounded-lg border bg-surface-deep transition-colors",
            MODE_CONFIG[mode as InteractionMode].inputBorder,
          )}
        >
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
        </div>
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
          className="my-0.5 shrink-0 cursor-pointer self-stretch rounded-lg border border-border px-3 text-muted-foreground transition-colors hover:text-foreground hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-50"
          title="Attach files"
        >
          <Paperclip size={16} />
        </button>
        {isActive ? (
          <button
            onClick={onStop}
            className="my-0.5 shrink-0 cursor-pointer self-stretch rounded-lg border border-border px-3 text-muted-foreground transition-colors hover:text-foreground hover:bg-surface-elevated"
            title="Stop"
          >
            <Square size={16} />
          </button>
        ) : (
          <button
            onClick={handleQueueSubmit}
            disabled={(!hasContent && images.length === 0) || !canSend || isSending}
            className={cn(
              "my-0.5 shrink-0 cursor-pointer self-stretch rounded-lg px-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
              MODE_CONFIG[mode as InteractionMode].sendButton,
            )}
          >
            <Send size={16} />
          </button>
        )}
      </div>

      <SessionInputOptions
        sessionId={sessionId}
        mode={mode}
        onModeChange={cycleMode}
        isActive={isActive}
      />
    </div>
  );
}
