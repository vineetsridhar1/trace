import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { QUEUE_SESSION_MESSAGE_MUTATION, SEND_SESSION_MESSAGE_MUTATION } from "@trace/client-core";
import type { SessionEntity } from "@trace/client-core";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { client } from "../../lib/urql";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { canQueueMessage, canSendMessage } from "./sessionStatus";

function formatFileScopedPrompt(filePath: string, text: string): string {
  return `File context: \`${filePath}\`\n\n${text}`;
}

function sessionLabel(session: SessionEntity): string {
  return session.name?.trim() || session.tool || "Agent";
}

export function FileScopedAiInput({
  filePath,
  sessions,
}: {
  filePath: string;
  sessions: SessionEntity[];
}) {
  const defaultSessionId = sessions[0]?.id ?? null;
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(defaultSessionId);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const userSelectedSessionRef = useRef(false);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) ?? null,
    [selectedSessionId, sessions],
  );

  useEffect(() => {
    if (sessions.length === 0) {
      setSelectedSessionId(null);
      userSelectedSessionRef.current = false;
      return;
    }
    if (!userSelectedSessionRef.current) {
      setSelectedSessionId(sessions[0].id);
      return;
    }
    if (selectedSessionId && sessions.some((session) => session.id === selectedSessionId)) return;
    userSelectedSessionRef.current = false;
    setSelectedSessionId(sessions[0].id);
  }, [selectedSessionId, sessions]);

  const handleSessionChange = useCallback((sessionId: string | null) => {
    if (!sessionId) return;
    userSelectedSessionRef.current = true;
    setSelectedSessionId(sessionId);
  }, []);

  const trimmedMessage = message.trim();
  const canSendSelected =
    !!selectedSession &&
    selectedSession._optimistic !== true &&
    (canSendMessage(
      selectedSession.agentStatus,
      selectedSession.connection as Record<string, unknown> | null | undefined,
      selectedSession.worktreeDeleted,
    ) ||
      canQueueMessage(selectedSession.agentStatus, selectedSession.worktreeDeleted));
  const canSubmit = trimmedMessage.length > 0 && canSendSelected && !sending;

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedSession || !canSubmit) return;

      setSending(true);
      try {
        const text = formatFileScopedPrompt(filePath, trimmedMessage);
        const canQueue = canQueueMessage(
          selectedSession.agentStatus,
          selectedSession.worktreeDeleted,
        );
        const mutation = canQueue ? QUEUE_SESSION_MESSAGE_MUTATION : SEND_SESSION_MESSAGE_MUTATION;
        const result = await client
          .mutation(mutation, {
            sessionId: selectedSession.id,
            text,
          })
          .toPromise();

        if (result.error) throw result.error;
        setMessage("");
        toast.success(canQueue ? "Message queued" : "Message sent");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to send message");
      } finally {
        setSending(false);
      }
    },
    [canSubmit, filePath, selectedSession, trimmedMessage],
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="flex shrink-0 items-center gap-2 border-t border-[#2d2d2d] bg-[#252526] px-3 py-2"
    >
      <Select
        value={selectedSessionId ?? ""}
        onValueChange={handleSessionChange}
        disabled={sessions.length === 0 || sending}
      >
        <SelectTrigger
          size="sm"
          className="h-8 w-44 shrink-0 border-[#3c3c3c] bg-[#1e1e1e] px-2 text-[11px] text-[#cccccc] hover:bg-[#2f3030] focus:ring-0"
          title="Choose agent"
        >
          <SelectValue placeholder="No agents" />
        </SelectTrigger>
        <SelectContent align="start" className="min-w-56">
          {sessions.map((session) => (
            <SelectItem key={session.id} value={session.id}>
              <span className="min-w-0 truncate">{sessionLabel(session)}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        value={message}
        onChange={(event) => setMessage(event.currentTarget.value)}
        disabled={!canSendSelected || sending}
        placeholder={
          sessions.length === 0
            ? "No agents in this workspace"
            : canSendSelected
              ? "Ask about this file..."
              : "Selected agent cannot receive messages"
        }
        className={cn(
          "h-8 min-w-0 flex-1 rounded-md border-[#3c3c3c] bg-[#1e1e1e] px-3 text-[12px] text-[#d4d4d4] placeholder:text-[#777777] focus-visible:border-[#5a5a5a] focus-visible:ring-0",
          !canSendSelected && "cursor-not-allowed opacity-60",
        )}
      />

      <Button
        type="submit"
        size="icon"
        variant="ghost"
        disabled={!canSubmit}
        className="h-8 w-8 shrink-0 rounded-md border border-[#3c3c3c] text-[#cccccc] hover:bg-[#2f3030] hover:text-[#ffffff] disabled:opacity-40"
        title="Send to agent"
      >
        <Send size={14} />
      </Button>
    </form>
  );
}
