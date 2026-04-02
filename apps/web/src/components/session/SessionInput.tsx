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
import { ChatEditor, type ChatEditorHandle, type SlashCommandItem } from "../chat/ChatEditor";
import { useSlashCommands } from "./useSlashCommands";
import { createQuickSession } from "../../lib/create-quick-session";
import { useUIStore } from "../../stores/ui";

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
  const [editorText, setEditorText] = useState("");
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<InteractionMode>("code");
  const editorRef = useRef<ChatEditorHandle>(null);
  const isActive = agentStatus === "active";
  const isNotStarted = agentStatus === "not_started";
  const disconnected = isDisconnected(connection);
  const canSend =
    !isOptimistic && (isNotStarted || canSendMessage(agentStatus, connection, worktreeDeleted));
  const displayModel = model ? getModelLabel(model) : "Claude Code";

  const _lastUserMessageAt = useEntityField("sessions", sessionId, "_lastUserMessageAt") as string | undefined;
  const lastUserMessageAt = isActive ? _lastUserMessageAt : undefined;

  const slashCommands = useSlashCommands(sessionId);
  const slashFilterMatch = editorText.match(/^\/([^\s]*)$/);
  const slashFilter = slashFilterMatch ? slashFilterMatch[1].toLowerCase() : null;
  const visibleSlashCommands = slashFilter === null
    ? []
    : slashCommands.commands.filter((cmd) => cmd.value.toLowerCase().startsWith(slashFilter));

  const cycleMode = useCallback(() => {
    setMode((prev) => {
      const idx = MODE_CYCLE.indexOf(prev);
      return MODE_CYCLE[(idx + 1) % MODE_CYCLE.length];
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    const text = editorRef.current?.getText() ?? "";
    if (!text || sending || !canSend) return;
    setSending(true);
    const wrappedText = wrapPrompt(mode, text);

    const { eventId: tempEventId, clientMutationId } = optimisticallyInsertSessionMessage(
      sessionId,
      wrappedText,
    );

    try {
      const result = await client
        .mutation(SEND_SESSION_MESSAGE_MUTATION, {
          sessionId,
          text: wrappedText,
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
      editorRef.current?.clear();
    } catch (error) {
      removeOptimisticSessionMessage(sessionId, tempEventId);
      toast.error(error instanceof Error ? error.message : "Failed to send message");
    } finally {
      setSending(false);
      editorRef.current?.focus();
    }
  }, [sessionId, sending, mode, canSend]);

  const handleSlashCommand = useCallback(
    async (cmd: SlashCommandItem) => {
      if (cmd.category === "special") {
        // /clear — create a new session tab
        const channelId = useUIStore.getState().activeChannelId;
        if (channelId) {
          void createQuickSession(channelId);
        }
        return;
      }

      setSending(true);
      const text = `/${cmd.id}`;
      const { eventId: tempEventId, clientMutationId } = optimisticallyInsertSessionMessage(
        sessionId,
        text,
      );

      try {
        const result = await client
          .mutation(SEND_SESSION_MESSAGE_MUTATION, {
            sessionId,
            text,
            clientMutationId,
          })
          .toPromise();

        if (result.error) throw result.error;
        const realEventId = result.data?.sendSessionMessage?.id;
        if (!realEventId) throw new Error("Failed to send message");
        reconcileOptimisticSessionMessage(sessionId, tempEventId, realEventId);
      } catch (error) {
        removeOptimisticSessionMessage(sessionId, tempEventId);
        toast.error(error instanceof Error ? error.message : "Failed to send command");
      } finally {
        setSending(false);
      }
    },
    [sessionId],
  );

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
        MODE_CONFIG[mode].containerBorder,
      )}
    >
      <div className="flex items-center gap-2">
        {!isNotStarted && (
          <Tooltip>
            <TooltipTrigger className="flex items-center text-muted-foreground">
              {hosting === "cloud" ? (
                <Cloud size={14} className={cn("transition-colors", MODE_CONFIG[mode].iconColor)} />
              ) : (
                <Monitor
                  size={14}
                  className={cn("transition-colors", MODE_CONFIG[mode].iconColor)}
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
            MODE_CONFIG[mode].inputBorder,
          )}
        >
          <div className="relative session-editor">
            {slashFilter !== null && (
              <div className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-lg border bg-surface-elevated shadow-lg">
                {visibleSlashCommands.length > 0 ? (
                  <div className="max-h-64 overflow-y-auto p-1">
                    {visibleSlashCommands.map((cmd) => (
                      <button
                        key={`${cmd.source}:${cmd.id}`}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          void handleSlashCommand(cmd);
                        }}
                        className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-surface-deep"
                      >
                        <span className="font-mono text-foreground">/{cmd.value}</span>
                        <span className="truncate text-xs text-muted-foreground">{cmd.description}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-3 py-2 text-sm text-muted-foreground">No matching commands</div>
                )}
              </div>
            )}
            <ChatEditor
              ref={editorRef}
              onSubmit={handleSubmit}
              placeholder={placeholder}
              disabled={!canSend || sending}
              onShiftTab={cycleMode}
              onChange={(text) => {
                setEditorText(text);
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
            onClick={handleSubmit}
            disabled={!hasContent || sending || !canSend}
            className={cn(
              "my-0.5 shrink-0 cursor-pointer self-stretch rounded-lg px-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
              MODE_CONFIG[mode].sendButton,
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
