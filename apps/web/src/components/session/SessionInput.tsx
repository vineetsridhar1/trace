import { useCallback, useRef, useState } from "react";
import { gql } from "@urql/core";
import { Send, Square, Cloud, Monitor } from "lucide-react";
import { useEntityField } from "@trace/client-core";
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
import { ImageAttachmentBar, type ImageAttachment } from "./ImageAttachmentBar";
import { uploadImage } from "../../lib/upload";
import { generateUUID } from "@trace/client-core";
import { useAuthStore } from "@trace/client-core";
import { useDraftsStore } from "../../stores/drafts";
import { BridgeAccessNotice } from "./BridgeAccessNotice";
import { isBridgeInteractionAllowed, type BridgeRuntimeAccessInfo } from "./useBridgeRuntimeAccess";

const EMPTY_IMAGES: ImageAttachment[] = [];

const MAX_IMAGES = 5;

const START_ULTRAPLAN_MUTATION = gql`
  mutation StartUltraplanFromComposer($input: StartUltraplanInput!) {
    startUltraplan(input: $input) {
      id
      status
      sessionGroupId
      updatedAt
    }
  }
`;

function normalizeControllerProvider(tool?: string | null): string {
  if (tool === "claude_code" || tool === "codex" || tool === "custom") return tool;
  return "codex";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected client error";
}

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
  const tool = useEntityField("sessions", sessionId, "tool") as string | undefined;
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
  const images = useDraftsStore((s) => s.drafts[sessionId]?.images ?? EMPTY_IMAGES);
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
  const editorRef = useRef<ChatEditorHandle>(null);
  const isActive = agentStatus === "active";
  const isNotStarted = agentStatus === "not_started";
  const disconnected = isDisconnected(connection);
  const canQueue = canQueueMessage(agentStatus, worktreeDeleted);
  const bridgeInteractionAllowed = isBridgeInteractionAllowed(bridgeAccess);
  const canSend =
    bridgeInteractionAllowed &&
    !isOptimistic &&
    (isNotStarted || canSendMessage(agentStatus, connection, worktreeDeleted) || canQueue);
  const canStartUltraplan = bridgeInteractionAllowed && !isOptimistic && !worktreeDeleted;
  const canSubmit = mode === "ultraplan" ? canStartUltraplan : canSend;
  const displayModel = model ? getModelLabel(model) : "Claude Code";

  const _lastUserMessageAt = useEntityField("sessions", sessionId, "lastUserMessageAt") as
    | string
    | undefined;
  const lastUserMessageAt = isActive ? _lastUserMessageAt : undefined;

  const slashCommands = useSlashCommands(sessionId);

  const cycleMode = useCallback(() => {
    setMode((prev: InteractionMode) => {
      const idx = MODE_CYCLE.indexOf(prev);
      return MODE_CYCLE[(idx + 1) % MODE_CYCLE.length];
    });
  }, []);

  const handleImagePaste = useCallback(
    (files: File[]) => {
      if (isSendingRef.current) return;
      setDraftImages(sessionId, (prev) => {
        const remaining = MAX_IMAGES - prev.length;
        if (remaining <= 0) return prev;
        const newImages: ImageAttachment[] = files.slice(0, remaining).map((file) => ({
          id: generateUUID(),
          file,
          previewUrl: URL.createObjectURL(file),
          s3Key: null,
          uploading: false,
        }));
        return [...prev, ...newImages];
      });
    },
    [sessionId, setDraftImages],
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

      if (text === "/clear") {
        const channelId = useUIStore.getState().activeChannelId;
        if (channelId) {
          void createQuickSession(channelId);
        }
        return;
      }

      if (mode === "ultraplan") {
        if (!text && images.length === 0) return;
        if (!canStartUltraplan) {
          toast.error("Ultraplan cannot start from this session");
          throw new Error("Ultraplan cannot start from this session");
        }
        if (!sessionGroupId) {
          toast.error("Ultraplan needs a session group");
          throw new Error("Ultraplan needs a session group");
        }
        if (images.length > 0) {
          toast.error("Ultraplan goals do not support image attachments yet");
          throw new Error("Ultraplan goals do not support image attachments yet");
        }

        isSendingRef.current = true;
        setIsSending(true);
        let handledError = false;
        try {
          const runtimePolicy: Record<string, unknown> = {};
          if (hosting === "cloud" || hosting === "local") {
            runtimePolicy.hosting = hosting;
          }
          if (
            connection &&
            typeof connection === "object" &&
            typeof connection.runtimeInstanceId === "string" &&
            connection.runtimeInstanceId.trim()
          ) {
            runtimePolicy.runtimeInstanceId = connection.runtimeInstanceId;
          }

          const result = await client
            .mutation(START_ULTRAPLAN_MUTATION, {
              input: {
                sessionGroupId,
                goal: text,
                controllerProvider: normalizeControllerProvider(tool),
                ...(model ? { controllerModel: model } : {}),
                ...(Object.keys(runtimePolicy).length > 0
                  ? { controllerRuntimePolicy: runtimePolicy }
                  : {}),
              },
            })
            .toPromise();

          if (result.error) {
            handledError = true;
            toast.error("Failed to start Ultraplan", { description: result.error.message });
            throw result.error;
          }

          toast.success("Ultraplan started");
        } catch (error: unknown) {
          if (!handledError) {
            toast.error("Failed to start Ultraplan", { description: errorMessage(error) });
          }
          throw error;
        } finally {
          isSendingRef.current = false;
          setIsSending(false);
        }
        return;
      }

      if ((!text && images.length === 0) || !canSend) return;

      isSendingRef.current = true;
      setIsSending(true);
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
              savedImages.map((img) => uploadImage(img.file, orgId ?? undefined)),
            );
          } catch (error) {
            setDraftImages(sessionId, (prev) =>
              prev.map((img) => (savedIds.has(img.id) ? { ...img, uploading: false } : img)),
            );
            toast.error(error instanceof Error ? error.message : "Failed to upload image");
            throw error;
          }
        }

        if (canQueue) {
          try {
            const result = await client
              .mutation(QUEUE_SESSION_MESSAGE_MUTATION, {
                sessionId,
                text: wrappedText,
                imageKeys: imageKeys.length > 0 ? imageKeys : undefined,
                interactionMode: mode === "code" ? undefined : mode,
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

        const { eventId: tempEventId, clientMutationId } = optimisticallyInsertSessionMessage(
          sessionId,
          wrappedText,
          imageKeys.length > 0 ? { imageKeys, imagePreviewUrls } : undefined,
        );

        setDraftImages(sessionId, (prev) => prev.filter((img) => !savedIds.has(img.id)));

        try {
          const result = await client
            .mutation(SEND_SESSION_MESSAGE_MUTATION, {
              sessionId,
              text: wrappedText,
              imageKeys: imageKeys.length > 0 ? imageKeys : undefined,
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
    [
      sessionId,
      mode,
      canSend,
      canQueue,
      canStartUltraplan,
      images,
      sessionGroupId,
      hosting,
      connection,
      tool,
      model,
    ],
  );

  // If the user has bridge access (owner or granted), a disconnected session
  // belongs to the recovery panel — not the permission prompt. Non-owners
  // without access always see the permission prompt so they can request
  // access, whether the bridge is online or offline.
  if (bridgeInteractionAllowed && disconnected && !isNotStarted) {
    return <SessionRecoveryPanel sessionId={sessionId} connection={connection} />;
  }

  if (!bridgeInteractionAllowed) {
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
      : mode === "ultraplan"
        ? "Describe the goal for Ultraplan..."
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
      <ImageAttachmentBar images={images} onRemove={handleRemoveImage} />
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
              disabled={!canSubmit || isSending}
              slashCommands={slashCommands.commands}
              onShiftTab={cycleMode}
              onImagePaste={handleImagePaste}
              hasAttachments={images.length > 0}
              onChange={(text: string, html: string) => {
                setHasContent(text.trim().length > 0);
                setDraftText(sessionId, text, html);
              }}
            />
          </div>
        </div>
        {isActive ? (
          <>
            <button
              onClick={() => void editorRef.current?.submit()}
              disabled={(!hasContent && images.length === 0) || !canSubmit || isSending}
              className={cn(
                "my-0.5 shrink-0 cursor-pointer self-stretch rounded-lg px-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                MODE_CONFIG[mode as InteractionMode].sendButton,
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
            disabled={(!hasContent && images.length === 0) || !canSubmit || isSending}
            className={cn(
              "my-0.5 shrink-0 cursor-pointer self-stretch rounded-lg px-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
              MODE_CONFIG[mode as InteractionMode].sendButton,
            )}
          >
            <Send size={16} />
          </button>
        )}
      </div>

      {isActive && <AiLoadingIndicator model={displayModel} startedAt={lastUserMessageAt} />}
      <SessionInputOptions
        sessionId={sessionId}
        mode={mode}
        onModeChange={cycleMode}
        isActive={isActive}
      />
    </div>
  );
}
