import { useCallback, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import { useUIStore } from "../../stores/ui";
import { useEntityField } from "../../stores/entity";
import { usePreferencesStore } from "../../stores/preferences";
import { useAuthStore } from "../../stores/auth";
import { client } from "../../lib/urql";
import { START_SESSION_MUTATION, RUN_SESSION_MUTATION } from "../../lib/mutations";
import { optimisticallyInsertSession } from "../../lib/optimistic-session";
import { type InteractionMode, MODE_CYCLE, MODE_CONFIG, wrapPrompt } from "./interactionModes";
import { getDefaultModel, getModelsForTool, getModelLabel } from "./modelOptions";
import { RuntimeSelector, CLOUD_RUNTIME_ID } from "./RuntimeSelector";
import type { RuntimeInfo } from "./RuntimeSelector";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { cn } from "../../lib/utils";

const TOOL_LABELS: Record<string, string> = {
  claude_code: "Claude Code",
  codex: "Codex",
};

export function NewSessionView({ channelId }: { channelId: string }) {
  const prefTool = usePreferencesStore((s) => s.defaultTool) ?? "claude_code";
  const prefModel = usePreferencesStore((s) => s.defaultModel) ?? getDefaultModel(prefTool);

  const [tool, setTool] = useState(prefTool);
  const [model, setModel] = useState<string | undefined>(prefModel ?? undefined);
  const [runtimeInstanceId, setRuntimeInstanceId] = useState<string | undefined>(undefined);
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | null>(null);
  const [mode, setMode] = useState<InteractionMode>("code");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const channelRepoRaw = useEntityField("channels", channelId, "repo");
  const channelRepoId =
    channelRepoRaw && typeof channelRepoRaw === "object" && "id" in channelRepoRaw
      ? (channelRepoRaw as { id: string }).id
      : undefined;

  const setPendingNewSession = useUIStore((s) => s.setPendingNewSession);
  const setActiveSessionGroupId = useUIStore((s) => s.setActiveSessionGroupId);
  const openSessionTab = useUIStore((s) => s.openSessionTab);

  const modelOptions = getModelsForTool(tool);
  const modeConfig = MODE_CONFIG[mode];
  const ModeIcon = modeConfig.icon;

  const handleToolChange = useCallback((v: string) => {
    setTool(v);
    setModel(getDefaultModel(v) ?? undefined);
  }, []);

  const handleRuntimeChange = useCallback((id: string | undefined, info: RuntimeInfo | null) => {
    setRuntimeInstanceId(id);
    setRuntimeInfo(info);
  }, []);

  const cycleMode = useCallback(() => {
    setMode((prev) => MODE_CYCLE[(MODE_CYCLE.indexOf(prev) + 1) % MODE_CYCLE.length]);
  }, []);

  const handleSend = useCallback(async () => {
    const text = message.trim();
    if (!text || sending || !activeOrgId) return;
    setSending(true);
    try {
      const isCloud = !runtimeInstanceId || runtimeInstanceId === CLOUD_RUNTIME_ID;
      const wrappedPrompt = wrapPrompt(mode, text);

      const result = await client
        .mutation(START_SESSION_MUTATION, {
          input: {
            tool,
            model: model ?? undefined,
            hosting: isCloud ? "cloud" : undefined,
            runtimeInstanceId: isCloud ? undefined : runtimeInstanceId,
            channelId,
            repoId: channelRepoId ?? undefined,
            prompt: text,
          },
        })
        .toPromise();

      const session = result.data?.startSession;
      if (!session?.id) return;

      const sessionGroupId = session.sessionGroupId;

      // Run the session with the wrapped prompt
      await client
        .mutation(RUN_SESSION_MUTATION, {
          id: session.id,
          prompt: wrappedPrompt,
          interactionMode: mode === "code" ? undefined : mode,
        })
        .toPromise();

      if (sessionGroupId) {
        optimisticallyInsertSession({
          id: session.id,
          sessionGroupId,
          tool,
          model: model ?? null,
          hosting: isCloud ? "cloud" : (runtimeInfo?.hostingMode ?? "local"),
          channel: { id: channelId },
          repo: channelRepoId ? { id: channelRepoId } : null,
        });
        openSessionTab(sessionGroupId, session.id);
        setPendingNewSession(false);
        setActiveSessionGroupId(sessionGroupId, session.id);
      }
    } finally {
      setSending(false);
    }
  }, [
    message, sending, activeOrgId, tool, model, runtimeInstanceId, runtimeInfo,
    mode, channelId, channelRepoId, openSessionTab, setPendingNewSession,
    setActiveSessionGroupId,
  ]);

  const handleClose = useCallback(() => {
    setPendingNewSession(false);
  }, [setPendingNewSession]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <h2 className="text-sm font-medium text-foreground">New Session</h2>
        <button
          onClick={handleClose}
          className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Empty content area */}
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Choose your options below and send a message to start.
        </p>
      </div>

      {/* Input area */}
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
            autoFocus
            disabled={sending}
            placeholder="What should the agent work on?"
            rows={1}
            style={{ fieldSizing: "content" } as React.CSSProperties}
            className="flex-1 resize-none rounded-lg border border-border bg-surface-deep px-3 py-2 text-base md:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!message.trim() || sending}
            className="shrink-0 rounded-lg bg-accent px-3 py-2 text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            <Send size={16} />
          </button>
        </div>

        {/* Options row */}
        <div className="mt-2 flex items-center gap-1">
          <Select value={tool} onValueChange={handleToolChange}>
            <SelectTrigger className="h-7 w-auto gap-1.5 border-none bg-transparent px-2 text-[11px] text-muted-foreground hover:text-foreground focus:ring-0">
              <SelectValue>{TOOL_LABELS[tool] ?? tool}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="claude_code">Claude Code</SelectItem>
              <SelectItem value="codex">Codex</SelectItem>
            </SelectContent>
          </Select>
          {modelOptions.length > 0 && (
            <Select value={model ?? ""} onValueChange={(v) => { if (v) setModel(v); }}>
              <SelectTrigger className="h-7 w-auto gap-1.5 border-none bg-transparent px-2 text-[11px] text-muted-foreground hover:text-foreground focus:ring-0">
                <SelectValue>{model ? getModelLabel(model) : ""}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="h-7">
            <RuntimeSelector
              tool={tool}
              open
              value={runtimeInstanceId}
              onChange={handleRuntimeChange}
              channelRepoId={channelRepoId}
            />
          </div>
          <button
            type="button"
            onClick={cycleMode}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
              modeConfig.style,
            )}
          >
            <ModeIcon size={14} className="shrink-0" />
            {modeConfig.label}
          </button>
        </div>
      </div>
    </div>
  );
}
