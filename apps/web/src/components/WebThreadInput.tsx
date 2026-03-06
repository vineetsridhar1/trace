import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiSend,
  FiClock,
  FiX,
  FiSquare,
  FiEdit3,
  FiMap,
  FiHelpCircle,
} from "react-icons/fi";
import { useWorkspaceActions } from "../hooks/useWorkspaceActions";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useThreadStore } from "../stores/threadStore";
import { useSlashCommands } from "../hooks/useSlashCommands";
import { useFileMention } from "../hooks/useFileMention";
import { WebSlashCommandMenu } from "./WebSlashCommandMenu";
import { WebFileMentionMenu } from "./WebFileMentionMenu";

// ─── Interaction mode ──────────────────────────────────────────

type InteractionMode = "code" | "plan" | "ask";

const MODE_CYCLE: InteractionMode[] = ["code", "plan", "ask"];
const MODE_CONFIG: Record<
  InteractionMode,
  { label: string; icon: React.ReactNode; style: string }
> = {
  code: {
    label: "Code",
    icon: <FiEdit3 className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />,
    style: "btn-secondary border-edge text-primary",
  },
  plan: {
    label: "Plan",
    icon: <FiMap className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />,
    style: "border-accent bg-accent/20 text-accent-light",
  },
  ask: {
    label: "Ask",
    icon: (
      <FiHelpCircle
        className="h-3.5 w-3.5 flex-shrink-0"
        aria-hidden="true"
      />
    ),
    style: "border-amber-500 bg-amber-500/20 text-amber-300",
  },
};

// ─── Token formatting ──────────────────────────────────────────

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ─── Elapsed timer ─────────────────────────────────────────────

function computeElapsed(startTime: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(startTime).getTime()) / 1000));
}

function ElapsedTimer({ startTime }: { startTime: string }) {
  const [elapsed, setElapsed] = useState(() => computeElapsed(startTime));

  useEffect(() => {
    const tick = () => setElapsed(computeElapsed(startTime));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  return (
    <span className="text-xs tabular-nums text-muted">
      {mins}:{secs.toString().padStart(2, "0")}
    </span>
  );
}

// ─── Component ─────────────────────────────────────────────────

interface WebThreadInputProps {
  workspaceId: string;
  channelId: string;
  disabled?: boolean;
  repoPath?: string;
}

export function WebThreadInput({
  workspaceId,
  channelId,
  disabled,
  repoPath,
}: WebThreadInputProps) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [isQueued, setIsQueued] = useState(false);
  const [mode, setMode] = useState<InteractionMode>("code");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { sendMessage, stopCurrentAgent, switchMode } = useWorkspaceActions();

  const slashCommands = useSlashCommands(input, setInput, repoPath);
  const fileMention = useFileMention(input, setInput, repoPath ?? "", textareaRef);

  const workspace = useWorkspaceStore((s) =>
    s.workspaces.find((w) => w.id === workspaceId),
  );
  const isRunning =
    workspace?.status === "in_progress" ||
    workspace?.status === "needs_input";

  const tokenUsage = useThreadStore((s) => s.tokenUsage);

  const lastUserMessageTime = useThreadStore((s) => {
    const events = s.sessionEvents;
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].hookEventName === "UserPromptSubmit") {
        return events[i].timestamp;
      }
    }
    return null;
  });

  const cycleMode = useCallback(() => {
    if (disabled) return;
    setMode((m) => {
      const next = MODE_CYCLE[(MODE_CYCLE.indexOf(m) + 1) % MODE_CYCLE.length];
      void switchMode(workspaceId, channelId, next);
      return next;
    });
  }, [disabled, switchMode, workspaceId, channelId]);

  const sendNow = useCallback(async () => {
    const text = input.trim();
    if (!text || disabled || sending) return;

    let finalText = text;
    if (mode === "plan") {
      finalText = `Before implementing, first create a detailed plan and present it for review. Use plan mode. Once the plan is approved, proceed with implementation.\n\n${text}`;
    } else if (mode === "ask") {
      finalText = `<trace-internal>\nDo NOT modify any files. Only read files and answer questions. Do not use Edit, Write, or NotebookEdit tools. This is read-only/ask mode.\n</trace-internal>\n\n${text}`;
    }

    // Append mentioned file paths
    const mentionedFiles = fileMention.getMentionedFiles();
    if (mentionedFiles.length > 0) {
      finalText += `\n\n<trace-internal>Referenced files: ${mentionedFiles.join(", ")}</trace-internal>`;
    }

    setSending(true);
    setIsQueued(false);
    const previousInput = input;
    setInput("");

    try {
      const result = await sendMessage(
        workspaceId,
        finalText,
        channelId,
        undefined,
        undefined,
        mode === "plan",
      );
      if (!result.success) {
        setInput(previousInput);
      }
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }, [input, disabled, sending, mode, sendMessage, workspaceId, channelId, fileMention]);

  const handleSendOrQueue = useCallback(() => {
    const text = input.trim();
    if (!text) return;

    if (isRunning) {
      setIsQueued(true);
    } else {
      void sendNow();
    }
  }, [input, isRunning, sendNow]);

  // Auto-send queued message when agent finishes
  const wasRunningRef = useRef(isRunning);
  useEffect(() => {
    const wasRunning = wasRunningRef.current;
    wasRunningRef.current = isRunning;

    if (wasRunning && !isRunning && isQueued) {
      void sendNow();
    }
  }, [isRunning, isQueued, sendNow]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        cycleMode();
        return;
      }

      // Check slash commands first
      if (slashCommands.handleKeyDown(e)) return;

      // Then file mentions
      if (fileMention.handleKeyDown(e)) return;

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendOrQueue();
      }
    },
    [cycleMode, handleSendOrQueue, slashCommands, fileMention],
  );

  const handleStop = useCallback(async () => {
    if (disabled) return;
    await stopCurrentAgent(workspaceId);
  }, [disabled, stopCurrentAgent, workspaceId]);

  const config = MODE_CONFIG[mode];

  return (
    <div className="border-t border-edge px-3 py-3">
      {/* "Claude is working..." status bar */}
      {isRunning && (
        <div className="mb-2 flex items-center gap-2 px-1">
          <svg
            className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-accent-light"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
            />
          </svg>
          <span className="text-xs leading-none text-accent-light">
            Claude is working...
          </span>
          {lastUserMessageTime && (
            <ElapsedTimer startTime={lastUserMessageTime} />
          )}
        </div>
      )}

      {/* Queued message indicator */}
      {isQueued && (
        <div className="mb-2 flex items-center gap-2 px-1">
          <FiClock className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
          <span className="text-xs text-amber-400">
            Message queued — will send when Claude finishes
          </span>
          <button
            type="button"
            onClick={() => setIsQueued(false)}
            className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted transition-colors hover:bg-surface-elevated hover:text-primary"
          >
            <FiX className="h-3 w-3" />
            Cancel
          </button>
        </div>
      )}

      {/* Textarea + send/stop buttons */}
      <div className="relative flex items-end gap-2">
        {/* Autocomplete menus */}
        <WebSlashCommandMenu
          isOpen={slashCommands.isOpen && !fileMention.isOpen}
          commands={slashCommands.filteredCommands}
          selectedIndex={slashCommands.selectedIndex}
          onSelect={slashCommands.selectCommand}
        />
        <WebFileMentionMenu
          isOpen={fileMention.isOpen && !slashCommands.isOpen}
          files={fileMention.filteredFiles}
          selectedIndex={fileMention.selectedIndex}
          onSelect={fileMention.selectFile}
        />

        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (!e.target.value.trim()) setIsQueued(false);
          }}
          onKeyDown={handleKeyDown}
          onSelect={fileMention.handleSelect}
          onClick={fileMention.handleSelect}
          disabled={disabled}
          placeholder={
            disabled
              ? "Instance offline..."
              : isRunning
                ? isQueued
                  ? "Edit your queued message..."
                  : "Type a message to queue..."
                : "Send to Claude... (/ for commands, @ for files)"
          }
          style={
            {
              fieldSizing: "content",
              minHeight: 38,
              maxHeight: 300,
            } as React.CSSProperties
          }
          className={`w-full resize-none rounded-md border bg-surface px-3 py-2 text-sm text-primary outline-none transition-colors placeholder:text-muted focus:border-edge-hover ${
            disabled
              ? "cursor-not-allowed border-edge opacity-50"
              : isQueued
                ? "border-amber-500/50"
                : "border-edge"
          }`}
        />
        {isRunning ? (
          <div className="flex gap-1.5">
            {!isQueued && input.trim() && (
              <button
                type="button"
                onClick={handleSendOrQueue}
                title="Queue message"
                className="h-[38px] cursor-pointer rounded-md bg-amber-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600"
              >
                <FiClock className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleStop()}
              title="Stop Claude"
              disabled={disabled}
              className="btn-primary h-[38px] cursor-pointer rounded-md px-3 py-2 text-sm font-medium text-on-accent"
            >
              <FiSquare className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void sendNow()}
            disabled={disabled || !input.trim() || sending}
            title="Send message"
            className="btn-primary h-[38px] cursor-pointer rounded-md px-3 py-2 text-sm font-medium text-on-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FiSend className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Mode toggle + token usage row */}
      {(!isRunning || (tokenUsage && tokenUsage.totalTokens > 0)) && (
        <div className="mt-2 flex items-center gap-1.5">
          {!isRunning && (
            <button
              type="button"
              onClick={cycleMode}
              disabled={disabled}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${config.style}`}
            >
              {config.icon}
              {config.label}
            </button>
          )}
          {tokenUsage && tokenUsage.totalTokens > 0 && (
            <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-medium text-muted">
              {formatTokenCount(tokenUsage.totalTokens)} tokens
              {tokenUsage.cliCostUsd != null && (
                <span className="text-muted/70">
                  &middot; ${tokenUsage.cliCostUsd.toFixed(2)}
                </span>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
