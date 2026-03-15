import { useCallback, useRef, useState } from "react";
import { Send } from "lucide-react";
import { gql } from "@urql/core";
import { useEntityField } from "../../stores/entity";
import { client } from "../../lib/urql";
import { SEND_SESSION_MESSAGE_MUTATION } from "../../lib/mutations";
import {
  type InteractionMode,
  MODE_CYCLE,
  wrapPrompt,
} from "./interactionModes";
import { AiLoadingIndicator } from "./AiLoadingIndicator";
import { SessionInputOptions } from "./SessionInputOptions";

export function SessionInput({ sessionId }: { sessionId: string }) {
  const status = useEntityField("sessions", sessionId, "status") as string | undefined;
  const model = useEntityField("sessions", sessionId, "model") as string | undefined;
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<InteractionMode>("code");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isActive = status === "active";
  const displayModel = model ?? "Claude Code";

  const cycleMode = useCallback(() => {
    setMode((prev) => {
      const idx = MODE_CYCLE.indexOf(prev);
      return MODE_CYCLE[(idx + 1) % MODE_CYCLE.length];
    });
  }, []);

  const handleSend = useCallback(async () => {
    const text = message.trim();
    if (!text || sending) return;
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
  }, [sessionId, message, sending, mode]);

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
          disabled={isActive || sending}
          placeholder={isActive ? "Waiting for response..." : "Send a message..."}
          rows={1}
          style={{ fieldSizing: "content" } as React.CSSProperties}
          className="flex-1 resize-none rounded-lg border border-border bg-surface-deep px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!message.trim() || sending || isActive}
          className="shrink-0 rounded-lg bg-accent px-3 py-2 text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          <Send size={16} />
        </button>
      </div>

      {isActive ? (
        <AiLoadingIndicator model={displayModel} />
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
