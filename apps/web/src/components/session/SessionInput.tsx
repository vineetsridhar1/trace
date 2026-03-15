import { useCallback, useRef, useState } from "react";
import { Send } from "lucide-react";
import { gql } from "@urql/core";
import type { CodingTool } from "@trace/gql";
import { useEntityField, useEntityStore } from "../../stores/entity";
import { client } from "../../lib/urql";
import { SEND_SESSION_MESSAGE_MUTATION } from "../../lib/mutations";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  type InteractionMode,
  MODE_CYCLE,
  MODE_CONFIG,
  wrapPrompt,
} from "./interactionModes";
import { getModelsForTool, getDefaultModel } from "./modelOptions";
import { cn } from "../../lib/utils";

const UPDATE_SESSION_CONFIG_MUTATION = gql`
  mutation UpdateSessionConfig($sessionId: ID!, $tool: CodingTool, $model: String) {
    updateSessionConfig(sessionId: $sessionId, tool: $tool, model: $model) {
      id
      tool
      model
    }
  }
`;

export function SessionInput({ sessionId }: { sessionId: string }) {
  const status = useEntityField("sessions", sessionId, "status") as string | undefined;
  const tool = useEntityField("sessions", sessionId, "tool") as string | undefined;
  const model = useEntityField("sessions", sessionId, "model") as string | undefined;
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<InteractionMode>("code");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isActive = status === "active";
  const currentTool = tool ?? "claude_code";
  const modelOptions = getModelsForTool(currentTool);
  const currentModel = model ?? getDefaultModel(currentTool);

  const cycleMode = useCallback(() => {
    setMode((prev) => {
      const idx = MODE_CYCLE.indexOf(prev);
      return MODE_CYCLE[(idx + 1) % MODE_CYCLE.length];
    });
  }, []);

  const handleToolChange = useCallback(async (newTool: string | null) => {
    if (!newTool) return;
    const newDefault = getDefaultModel(newTool);
    useEntityStore.getState().patch("sessions", sessionId, { tool: newTool as CodingTool, model: newDefault ?? null });
    await client.mutation(UPDATE_SESSION_CONFIG_MUTATION, { sessionId, tool: newTool, model: newDefault }).toPromise();
  }, [sessionId]);

  const handleModelChange = useCallback(async (newModel: string | null) => {
    if (!newModel) return;
    useEntityStore.getState().patch("sessions", sessionId, { model: newModel });
    await client.mutation(UPDATE_SESSION_CONFIG_MUTATION, { sessionId, model: newModel }).toPromise();
  }, [sessionId]);

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

  const modeConfig = MODE_CONFIG[mode];
  const ModeIcon = modeConfig.icon;

  return (
    <div className="shrink-0 border-t border-border px-4 py-3">
      <div className="mb-2 flex items-center gap-1">
        <Select value={currentTool} onValueChange={handleToolChange} disabled={isActive}>
          <SelectTrigger className="h-7 w-auto gap-1.5 border-none bg-transparent px-2 text-[11px] text-muted-foreground hover:text-foreground focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="claude_code">Claude Code</SelectItem>
            <SelectItem value="codex">Codex</SelectItem>
          </SelectContent>
        </Select>
        {modelOptions.length > 0 && (
          <Select value={currentModel ?? ""} onValueChange={handleModelChange} disabled={isActive}>
            <SelectTrigger className="h-7 w-auto gap-1.5 border-none bg-transparent px-2 text-[11px] text-muted-foreground hover:text-foreground focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <button
          type="button"
          onClick={cycleMode}
          disabled={isActive}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
            modeConfig.style,
          )}
        >
          <ModeIcon size={14} className="shrink-0" />
          {modeConfig.label}
        </button>
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
  );
}
