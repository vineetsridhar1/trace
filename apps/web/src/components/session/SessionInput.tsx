import { useCallback, useRef, useState, type ChangeEvent } from "react";
import { Cloud, Monitor, Paperclip, Send, Square } from "lucide-react";
import { useEntityField, useEntityStore, type SessionEntity } from "@trace/client-core";
import { client } from "../../lib/urql";
import { SEND_SESSION_MESSAGE_MUTATION, QUEUE_SESSION_MESSAGE_MUTATION } from "@trace/client-core";
import { type InteractionMode, MODE_CYCLE, MODE_CONFIG, wrapPrompt } from "./interactionModes";
import { AiLoadingIndicator } from "./AiLoadingIndicator";
import { SessionInputOptions } from "./SessionInputOptions";
import { isDisconnected, canSendMessage, canQueueMessage } from "./sessionStatus";
import { SessionRecoveryPanel } from "./SessionRecoveryPanel";
import { getModelLabel } from "./modelOptions";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { cn } from "../../lib/utils";
import { toast } from "sonner";
import {
  optimisticallyInsertSessionMessage,
  reconcileOptimisticSessionMessage,
  removeOptimisticSessionMessage,
} from "@trace/client-core";
import { ChatEditor, type ChatEditorHandle } from "../chat/ChatEditor";
import { useSlashCommands } from "./useSlashCommands";
import { createQuickSession } from "../../lib/create-quick-session";
import { useUIStore } from "../../stores/ui";
import { ImageAttachmentBar, type FileAttachment } from "./ImageAttachmentBar";
import { uploadFile } from "../../lib/upload";
import { generateUUID } from "@trace/client-core";
import { useAuthStore } from "@trace/client-core";
import { useDraftsStore } from "../../stores/drafts";
import { BridgeAccessNotice } from "./BridgeAccessNotice";
import { isBridgeInteractionAllowed, type BridgeRuntimeAccessInfo } from "./useBridgeRuntimeAccess";

const EMPTY_ATTACHMENTS: FileAttachment[] = [];

const MAX_ATTACHMENTS = 5;

export function SessionInput({
  sessionId,
  onStop,
  bridgeAccess,
  sessionGroupId,
  onAccessRequested,
  lockedMode,
  hideOptions,
}: {
  sessionId: string;
  onStop: () => void;
  bridgeAccess: BridgeRuntimeAccessInfo | null;
  sessionGroupId?: string | null;
  onAccessRequested?: () => void | Promise<void>;
  lockedMode?: InteractionMode;
  hideOptions?: boolean;
}) {
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus") as string | undefined;
  const model = useEntityField("sessions", sessionId, "model") as string | undefined;
  const connection = useEntityField("sessions", sessionId, "connection") as
    | Record<string, unknown>
    | null
    | undefined;
  const hosting = useEntityField("sessions", sessionId, "hosting") as string | undefined;
  const worktreeDeleted = useEntityField("sessions", sessionId, "worktreeDeleted") as
    | boolean
    | undefined;
  const isOptimistic = useEntityField("sessions", sessionId, "_optimistic") as boolean | undefined;
  const images = useDraftsStore((s) => s.drafts[sessionId]?.images ?? EMPTY_ATTACHMENTS);
  const setDraftImages = useDraftsStore((s) => s.setDraftImages);
  const setDraftText = useDraftsStore((s) => s.setDraftText);
  const [initialDraftHtml] = useState(
    () => useDraftsStore.getState().drafts[sessionId]?.html ?? "",
  );
  const [hasContent, setHasContent] = useState(
    () => (useDraftsStore.getState().drafts[sessionId]?.text ?? "").trim().length > 0,
  );
  const [mode, setMode] = useState<InteractionMode>("code");
  const effectiveMode = lockedMode ?? mode;
  const [isSending, setIsSending] = useState(false);
  const isSendingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<ChatEditorHandle>(null);
  const isActive = agentStatus === "active";
  const isNotStarted = agentStatus === "not_started";
  const disconnected = isDisconnected(connection);
  const canQueue = canQueueMessage(agentStatus, worktreeDeleted);
  const bridgeInteractionAllowed = hosting === "cloud" || isBridgeInteractionAllowed(bridgeAccess);
  const canSend =
    bridgeInteractionAllowed &&
    !isOptimistic &&
    (isNotStarted || canSendMessage(agentStatus, connection, worktreeDeleted) || canQueue);
  const displayModel = model ? getModelLabel(model) : "Claude Code";

  const _lastUserMessageAt = useEntityField("sessions", sessionId, "lastUserMessageAt") as
    | string
    | undefined;
  const lastUserMessageAt = isActive ? _lastUserMessageAt : undefined;

  const slashCommands = useSlashCommands(sessionId);

  const cycleMode = useCallback(() => {
    if (lockedMode) return;
    setMode((prev: InteractionMode) => {
      const idx = MODE_CYCLE.indexOf(prev);
      return MODE_CYCLE[(idx + 1) % MODE_CYCLE.length];
    });
  }, [lockedMode]);

  const addAttachments = useCallback(
    (files: File[]) => {
      if (isSendingRef.current) return;
      setDraftImages(sessionId, (prev) => {
        const remaining = MAX_ATTACHMENTS - prev.length;
        if (remaining <= 0) return prev;
        const newAttachments: FileAttachment[] = files.slice(0, remaining).map((file) => ({
          id: generateUUID(),
          file,
          previewUrl: URL.createObjectURL(file),
          s3Key: null,
          uploading: false,
        }));
        return [...prev, ...newAttachments];
      });
    },
    [sessionId, setDraftImages],
  );

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      addAttachments(Array.from(event.currentTarget.files ?? []));
      event.currentTarget.value = "";
    },
    [addAttachments],
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
    async (_html: string, text: string) => {
      if (isSendingRef.current) return;
      if ((!text && images.length === 0) || !canSend) return;

      if (text === "/clear") {
        const channelId = useUIStore.getState().activeChannelId;
        if (channelId) {
          void createQuickSession(channelId);
        }
        return;
      }

      isSendingRef.current = true;
      setIsSending(true);
      try {
        const savedImages = [...images];
        const imagePreviewUrls = savedImages.map((img) => img.previewUrl);
        const wrappedText = !text
          ? ""
          : text.startsWith("/")
            ? text
            : wrapPrompt(effectiveMode, text);

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

        if (canQueue) {
          try {
            const result = await client
              .mutation(QUEUE_SESSION_MESSAGE_MUTATION, {
                sessionId,
                text: wrappedText,
                attachmentKeys: imageKeys.length > 0 ? imageKeys : undefined,
                interactionMode: effectiveMode === "code" ? undefined : effectiveMode,
              })
              .toPromise();

            if (result.error) {
              throw result.error;
            }

            setDraftImages(sessionId, (prev) => prev.filter((img) => !savedIds.has(img.id)));
            for (const img of savedImages) URL.revokeObjectURL(img.previewUrl);
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
              interactionMode: effectiveMode === "code" ? undefined : effectiveMode,
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
          toast.error(error instanceof Error ? error.message : "Failed to send message");
          throw error;
        }
      } finally {
        isSendingRef.current = false;
        setIsSending(false);
      }
    },
    [sessionId, effectiveMode, canSend, canQueue, images, isNotStarted, hosting, connection],
  );

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
        MODE_CONFIG[effectiveMode].containerBorder,
      )}
    >
      <ImageAttachmentBar attachments={images} onRemove={handleRemoveImage} />
      <div className="flex items-center gap-2">
        {!isNotStarted && (
          <Tooltip>
            <TooltipTrigger className="flex items-center text-muted-foreground">
              {hosting === "cloud" ? (
                <Cloud
                  size={14}
                  className={cn(
                    "transition-colors",
                    MODE_CONFIG[effectiveMode].iconColor,
                  )}
                />
              ) : (
                <Monitor
                  size={14}
                  className={cn(
                    "transition-colors",
                    MODE_CONFIG[effectiveMode].iconColor,
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
            MODE_CONFIG[effectiveMode].inputBorder,
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
              onImagePaste={addAttachments}
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
          <>
            <button
              onClick={() => void editorRef.current?.submit()}
              disabled={(!hasContent && images.length === 0) || !canSend || isSending}
              className={cn(
                "my-0.5 shrink-0 cursor-pointer self-stretch rounded-lg px-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                MODE_CONFIG[effectiveMode].sendButton,
              )}
              title="Queue message"
            >
              <Send size={16} />
            </button>
            <button
              onClick={onStop}
              className="my-0.5 shrink-0 cursor-pointer self-stretch rounded-lg border border-border px-3 text-muted-foreground transition-colors hover:text-foreground hover:bg-surface-elevated"
              title="Stop"
            >
              <Square size={16} />
            </button>
          </>
        ) : (
          <button
            onClick={() => void editorRef.current?.submit()}
            disabled={(!hasContent && images.length === 0) || !canSend || isSending}
            className={cn(
              "my-0.5 shrink-0 cursor-pointer self-stretch rounded-lg px-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
              MODE_CONFIG[effectiveMode].sendButton,
            )}
          >
            <Send size={16} />
          </button>
        )}
      </div>

      {isActive && <AiLoadingIndicator model={displayModel} startedAt={lastUserMessageAt} />}
      {!hideOptions && (
        <SessionInputOptions
          sessionId={sessionId}
          mode={effectiveMode}
          onModeChange={cycleMode}
          isActive={isActive}
        />
      )}
    </div>
  );
}
