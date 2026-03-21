import { useCallback, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useEntityField, useEntityStore } from "../../stores/entity";
import { client } from "../../lib/urql";
import { SEND_SESSION_MESSAGE_MUTATION } from "../../lib/mutations";
import {
  type InteractionMode,
  MODE_CYCLE,
  wrapPrompt,
} from "./interactionModes";
import { AiLoadingIndicator } from "./AiLoadingIndicator";
import { SessionInputOptions } from "./SessionInputOptions";
import { isDisconnected, canSendMessage } from "./sessionStatus";
import { SessionRecoveryPanel } from "./SessionRecoveryPanel";
import { getModelLabel } from "./modelOptions";

export function SessionInput({ sessionId }: { sessionId: string }) {
  const status = useEntityField("sessions", sessionId, "status") as string | undefined;
  const model = useEntityField("sessions", sessionId, "model") as string | undefined;
  const connection = useEntityField("sessions", sessionId, "connection") as Record<string, unknown> | null | undefined;
  const worktreeDeleted = useEntityField("sessions", sessionId, "worktreeDeleted") as boolean | undefined;
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<InteractionMode>("code");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isActive = status === "active";
  const disconnected = isDisconnected(connection);
  const canSend = canSendMessage(status, connection, worktreeDeleted);
  const displayModel = model ? getModelLabel(model) : "Claude Code";

  // Find the timestamp of the last user message for accurate working time
  const lastUserMessageAt = useEntityStore((s) => {
    if (!isActive) return undefined;
    let latest: string | undefined;
    const table = s.events;
    for (const id of Object.keys(table)) {
      const event = table[id];
      if (event.scopeType !== "session" || event.scopeId !== sessionId) continue;
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
      await client.mutation(SEND_SESSION_MESSAGE_MUTATION, {
        sessionId,
        text: wrappedText,
        interactionMode: mode === "code" ? undefined : mode,
      }).toPromise();
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [sessionId, message, sending, mode, canSend]);

  // Show recovery panel instead of input when disconnected
  if (disconnected) {
    return <SessionRecoveryPanel sessionId={sessionId} connection={connection} />;
  }

  const disabledPlaceholders: Record<string, string> = {
    merged: "Session merged. Follow-up messages are disabled.",
    failed: "Session failed. Follow-up messages are disabled.",
  };
  const placeholder = worktreeDeleted
    ? "Worktree deleted. This session is read-only."
    : isActive
      ? "Waiting for response..."
      : (status && disabledPlaceholders[status]) ?? "Send a message...";

  return (
    <div className="shrink-0 border-t border-border px-4 py-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={!canSend || sending}
          placeholder={placeholder}
          rows={1}
          style={{ fieldSizing: "content" } as React.CSSProperties}
          className="flex-1 resize-none rounded-lg border border-border bg-surface-deep px-3 py-2 text-base md:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!message.trim() || sending || !canSend}
          className="shrink-0 rounded-lg bg-accent px-3 py-2 text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          <Send size={16} />
        </button>
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
