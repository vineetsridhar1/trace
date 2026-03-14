import { useCallback, useRef, useState } from "react";
import { ArrowLeft, Play, Square, Circle, Send } from "lucide-react";
import { gql } from "@urql/core";
import { useEntityField, useEntityStore } from "../../stores/entity";
import { useUIStore } from "../../stores/ui";
import { useSessionEvents } from "../../hooks/useSessionEvents";
import { SessionMessageList } from "./SessionMessageList";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { client } from "../../lib/urql";

const RUN_SESSION_MUTATION = gql`
  mutation RunSession($id: ID!, $prompt: String) {
    runSession(id: $id, prompt: $prompt) {
      id
      status
    }
  }
`;

const SEND_SESSION_MESSAGE_MUTATION = gql`
  mutation SendSessionMessage($sessionId: ID!, $text: String!) {
    sendSessionMessage(sessionId: $sessionId, text: $text) {
      id
    }
  }
`;

const TERMINATE_SESSION_MUTATION = gql`
  mutation TerminateSession($id: ID!) {
    terminateSession(id: $id) {
      id
      status
    }
  }
`;

const UPDATE_SESSION_TOOL_MUTATION = gql`
  mutation UpdateSessionTool($sessionId: ID!, $tool: CodingTool!) {
    updateSessionTool(sessionId: $sessionId, tool: $tool) {
      id
      tool
    }
  }
`;

const statusColor: Record<string, string> = {
  pending: "text-muted-foreground",
  active: "text-green-400",
  paused: "text-yellow-400",
  completed: "text-muted-foreground",
  failed: "text-destructive",
  unreachable: "text-muted-foreground",
};

const statusLabel: Record<string, string> = {
  pending: "Pending",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  failed: "Failed",
  unreachable: "Unreachable",
};


export function SessionDetailView({ sessionId }: { sessionId: string }) {
  const name = useEntityField("sessions", sessionId, "name");
  const status = useEntityField("sessions", sessionId, "status") as string | undefined;
  const tool = useEntityField("sessions", sessionId, "tool") as string | undefined;
  const setActiveSessionId = useUIStore((s) => s.setActiveSessionId);
  const { eventIds, loading } = useSessionEvents(sessionId);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleRun = useCallback(async () => {
    setRunning(true);
    try {
      await client.mutation(RUN_SESSION_MUTATION, { id: sessionId }).toPromise();
    } finally {
      setRunning(false);
    }
  }, [sessionId]);

  const handleStop = useCallback(async () => {
    await client.mutation(TERMINATE_SESSION_MUTATION, { id: sessionId }).toPromise();
  }, [sessionId]);

  const handleToolChange = useCallback(async (newTool: string) => {
    // Optimistic update
    useEntityStore.getState().upsert("sessions", sessionId, { tool: newTool });
    await client.mutation(UPDATE_SESSION_TOOL_MUTATION, { sessionId, tool: newTool }).toPromise();
  }, [sessionId]);

  const handleSend = useCallback(async () => {
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    setMessage("");
    try {
      await client.mutation(SEND_SESSION_MESSAGE_MUTATION, { sessionId, text }).toPromise();
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [sessionId, message, sending]);

  const isActive = status === "active";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <button
          onClick={() => setActiveSessionId(null)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} />
        </button>

        <h2 className="text-sm font-semibold text-foreground truncate flex-1">
          {name ?? "Session"}
        </h2>

        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 text-xs ${statusColor[status ?? "active"]}`}>
            <Circle size={6} className="fill-current" />
            {statusLabel[status ?? "active"]}
          </span>

          {isActive ? (
            <button
              onClick={handleStop}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors"
            >
              <Square size={12} />
              Stop
            </button>
          ) : (
            <button
              onClick={handleRun}
              disabled={running}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors disabled:opacity-50"
            >
              <Play size={12} />
              Run
            </button>
          )}
        </div>
      </div>

      {/* Message list */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading events...</p>
        </div>
      ) : (
        <SessionMessageList eventIds={eventIds} />
      )}

      {/* Input */}
      <div className="shrink-0 border-t border-border px-4 py-3">
        <div className="mb-2">
          <Select value={tool ?? "claude_code"} onValueChange={handleToolChange} disabled={isActive}>
            <SelectTrigger className="h-7 w-auto gap-1.5 border-none bg-transparent px-2 text-[11px] text-muted-foreground hover:text-foreground focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="claude_code">Claude Code</SelectItem>
              <SelectItem value="codex">Codex</SelectItem>
              <SelectItem value="cursor">Cursor</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
      </div>
    </div>
  );
}
