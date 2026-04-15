import { useCallback, useRef, useState } from "react";
import { Send, Square, Cloud, Monitor } from "lucide-react";
import { useEntityField } from "../../stores/entity";
import { client } from "../../lib/urql";
import { SEND_SESSION_MESSAGE_MUTATION } from "../../lib/mutations";
import { type InteractionMode, MODE_CYCLE, MODE_CONFIG, wrapPrompt } from "./interactionModes";
import { AiLoadingIndicator } from "./AiLoadingIndicator";
import { SessionInputOptions } from "./SessionInputOptions";
import { isDisconnected, canSendMessage } from "./sessionStatus";
import { SessionRecoveryPanel } from "./SessionRecoveryPanel";
import { getModelLabel } from "./modelOptions";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { cn } from "../../lib/utils";
import { toast } from "sonner";
import {
  optimisticallyInsertSessionMessage,
  reconcileOptimisticSessionMessage,
  removeOptimisticSessionMessage,
} from "../../lib/optimistic-message";
import { ChatEditor, type ChatEditorHandle } from "../chat/ChatEditor";
import { useSlashCommands } from "./useSlashCommands";
import { createQuickSession } from "../../lib/create-quick-session";
import { useUIStore } from "../../stores/ui";
import { ImageAttachmentBar, type ImageAttachment } from "./ImageAttachmentBar";
import { uploadImage } from "../../lib/upload";
import { useAuthStore } from "../../stores/auth";

const MAX_IMAGES = 5;

export function SessionInput({ sessionId, onStop }: { sessionId: string; onStop: () => void }) {
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
  const [hasContent, setHasContent] = useState(false);
  const [mode, setMode] = useState<"code" | "plan" | "ask">("code");
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const editorRef = useRef<ChatEditorHandle>(null);
  const isActive = agentStatus === "active";
  const isNotStarted = agentStatus === "not_started";
  const disconnected = isDisconnected(connection);
  const canSend =
    !isOptimistic && (isNotStarted || canSendMessage(agentStatus, connection, worktreeDeleted));
  const displayModel = model ? getModelLabel(model) : "Claude Code";

  const _lastUserMessageAt = useEntityField("sessions", sessionId, "lastUserMessageAt") as string | undefined;
  const lastUserMessageAt = isActive ? _lastUserMessageAt : undefined;

  const slashCommands = useSlashCommands(sessionId);

  const cycleMode = useCallback(() => {
    setMode((prev: InteractionMode) => {
      const idx = MODE_CYCLE.indexOf(prev);
      return MODE_CYCLE[(idx + 1) % MODE_CYCLE.length];
    });
  }, []);

  const handleImagePaste = useCallback((files: File[]) => {
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) return;
    const newImages: ImageAttachment[] = files.slice(0, remaining).map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      s3Key: null,
      uploading: true,
    }));
    setImages((prev) => [...prev, ...newImages]);
    const orgId = useAuthStore.getState().activeOrgId;
    for (const img of newImages) {
      uploadImage(img.file, orgId ?? undefined)
        .then((key) => {
          setImages((curr) =>
            curr.map((i) => (i.id === img.id ? { ...i, s3Key: key, uploading: false } : i)),
          );
        })
        .catch(() => {
          toast.error("Failed to upload image");
          setImages((curr) => curr.filter((i) => i.id !== img.id));
        });
    }
  }, [images.length]);

  const handleRemoveImage = useCallback((id: string) => {
    setImages((prev) => {
      const img = prev.find((i) => i.id === id);
      if (img) URL.revokeObjectURL(img.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  const handleSubmit = useCallback(async (_html: string, text: string) => {
    if (!text || !canSend) return;

    if (text === "/clear") {
      const channelId = useUIStore.getState().activeChannelId;
      if (channelId) {
        void createQuickSession(channelId);
      }
      return;
    }

    // Check if any images are still uploading
    const stillUploading = images.some((img) => img.uploading);
    if (stillUploading) {
      toast.error("Please wait for images to finish uploading");
      throw new Error("Images still uploading");
    }

    const imageKeys = images.map((img) => img.s3Key).filter((k): k is string => k !== null);
    const imagePreviewUrls = images.map((img) => img.previewUrl);
    const wrappedText = text.startsWith("/") ? text : wrapPrompt(mode, text);

    const { eventId: tempEventId, clientMutationId } = optimisticallyInsertSessionMessage(
      sessionId,
      wrappedText,
      imageKeys.length > 0 ? { imageKeys, imagePreviewUrls } : undefined,
    );

    const savedImages = [...images];
    setImages([]);

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
      // Revoke blob URLs after successful send
      for (const img of savedImages) URL.revokeObjectURL(img.previewUrl);
    } catch (error) {
      removeOptimisticSessionMessage(sessionId, tempEventId);
      setImages(savedImages);
      toast.error(error instanceof Error ? error.message : "Failed to send message");
      throw error;
    }
  }, [sessionId, mode, canSend, images]);

  // Show recovery panel when disconnected — but not for not_started sessions
  if (disconnected && !isNotStarted) {
    return <SessionRecoveryPanel sessionId={sessionId} connection={connection} />;
  }
  const placeholder = worktreeDeleted
    ? "Worktree deleted. This session is read-only."
    : isOptimistic
      ? "Creating session..."
      : isActive
        ? "Waiting for response..."
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
      <div className="flex items-center gap-2">
        {!isNotStarted && (
          <Tooltip>
            <TooltipTrigger className="flex items-center text-muted-foreground">
              {hosting === "cloud" ? (
                <Cloud size={14} className={cn("transition-colors", MODE_CONFIG[mode as InteractionMode].iconColor)} />
              ) : (
                <Monitor
                  size={14}
                  className={cn("transition-colors", MODE_CONFIG[mode as InteractionMode].iconColor)}
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
          <ImageAttachmentBar images={images} onRemove={handleRemoveImage} />
          <div className="session-editor">
            <ChatEditor
              ref={editorRef}
              onSubmit={handleSubmit}
              placeholder={placeholder}
              disabled={!canSend}
              slashCommands={slashCommands.commands}
              onShiftTab={cycleMode}
              onImagePaste={handleImagePaste}
              onChange={(text: string) => {
                setHasContent(text.trim().length > 0);
              }}
            />
          </div>
        </div>
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
            onClick={() => void editorRef.current?.submit()}
            disabled={!hasContent || !canSend}
            className={cn(
              "my-0.5 shrink-0 cursor-pointer self-stretch rounded-lg px-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
              MODE_CONFIG[mode as InteractionMode].sendButton,
            )}
          >
            <Send size={16} />
          </button>
        )}
      </div>

      {isActive ? (
        <AiLoadingIndicator model={displayModel} startedAt={lastUserMessageAt} />
      ) : (
        <SessionInputOptions
          sessionId={sessionId}
          mode={mode}
          onModeChange={cycleMode}
          isActive={isActive}
        />
      )}
    </div>
  );
}
