import { useCallback, useRef, useState } from "react";
import { Send, Square, Cloud, Monitor } from "lucide-react";
import { useEntityField, useEntityStore, eventScopeKey } from "../../stores/entity";
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
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<InteractionMode>("code");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isActive = agentStatus === "active";
  const isNotStarted = agentStatus === "not_started";
  const disconnected = isDisconnected(connection);
  // not_started sessions can always send — the user picks runtime before first message
  const canSend = isNotStarted || canSendMessage(agentStatus, connection, worktreeDeleted);
  const displayModel = model ? getModelLabel(model) : "Claude Code";

  // Find the timestamp of the last user message for accurate working time
  const scopeKey = eventScopeKey("session", sessionId);
  const lastUserMessageAt = useEntityStore((s) => {
    if (!isActive) return undefined;
    let latest: string | undefined;
    const bucket = s.eventsByScope[scopeKey];
    if (!bucket) return undefined;
    for (const id of Object.keys(bucket)) {
      const event = bucket[id];
      if (event.eventType === "message_sent" || event.eventType === "session_started") {
        if (!latest || event.timestamp > latest) latest = event.timestamp;
      }
    }
    return latest;
  });

  const cycleMode = useCallback(() => {
    setMode((prev) => {
      const idx = MODE_CYCLE.indexOf(prev);
      return MODE_CYCLE[(idx + 1) % MODE_CYCLE.length];
    });
  }, []);

  const handleSend = useCallback(async () => {
    const text = message.trim();
    if (!text || sending || !canSend) return;
    setSending(true);
    setMessage("");
    try {
      const wrappedText = wrapPrompt(mode, text);
      await client
        .mutation(SEND_SESSION_MESSAGE_MUTATION, {
          sessionId,
          text: wrappedText,
          interactionMode: mode === "code" ? undefined : mode,
        })
        .toPromise();
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [sessionId, message, sending, mode, canSend]);

  // Show recovery panel when disconnected — but not for not_started sessions
  // where the user still needs to pick a runtime and type their first message
  if (disconnected && !isNotStarted) {
    return <SessionRecoveryPanel sessionId={sessionId} connection={connection} />;
  }
  const placeholder = worktreeDeleted
    ? "Worktree deleted. This session is read-only."
    : isActive
      ? "Waiting for response..."
      : isNotStarted
        ? "What should the agent work on?"
        : "Send a message...";

  return (
    <div className={cn("shrink-0 border-t px-4 py-3 transition-colors", mode === "plan" ? "border-violet-500/50" : mode === "ask" ? "border-orange-600/50" : "border-border")}>
      <div className="flex items-center gap-2">
        {!isNotStarted && (
          <Tooltip>
            <TooltipTrigger className="flex items-center text-muted-foreground">
              {hosting === "cloud" ? (
                <Cloud size={14} className="text-blue-400" />
              ) : (
                <Monitor size={14} className="text-green-400" />
              )}
            </TooltipTrigger>
            <TooltipContent>
              {hosting === "cloud" ? "Cloud" : (
                connection && typeof connection === "object" && "runtimeLabel" in connection
                  ? (connection.runtimeLabel as string) ?? "Local"
                  : "Local"
              )}
            </TooltipContent>
          </Tooltip>
        )}
        <textarea
          ref={inputRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Tab" && e.shiftKey) {
              e.preventDefault();
              cycleMode();
              return;
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={!canSend || sending}
          placeholder={placeholder}
          rows={1}
          style={{ fieldSizing: "content" } as React.CSSProperties}
          className={cn(
            "flex-1 resize-none rounded-lg border bg-surface-deep px-3 py-2 text-base md:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 disabled:opacity-50 transition-colors",
            MODE_CONFIG[mode].inputBorder,
          )}
        />
        {isActive ? (
          <button
            onClick={onStop}
            className="shrink-0 rounded-lg border border-border px-3 py-2 text-muted-foreground transition-colors hover:text-foreground hover:bg-surface-elevated"
            title="Stop"
          >
            <Square size={16} />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!message.trim() || sending || !canSend}
            className={cn("shrink-0 rounded-lg px-3 py-2 transition-colors disabled:opacity-50", MODE_CONFIG[mode].sendButton)}
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
