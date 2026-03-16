import { useState, useCallback } from "react";
import { Send, X } from "lucide-react";
import { client } from "../../lib/urql";
import { SEND_SESSION_MESSAGE_MUTATION, START_SESSION_MUTATION, RUN_SESSION_MUTATION } from "../../lib/mutations";
import { useEntityField } from "../../stores/entity";
import { useUIStore } from "../../stores/ui";
import { cn } from "../../lib/utils";

interface PlanResponseBarProps {
  sessionId: string;
  planContent: string;
  onDismiss: () => void;
}

const PRESETS = ["Approve (new session)", "Approve (keep context)"];

export function PlanResponseBar({ sessionId, planContent, onDismiss }: PlanResponseBarProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);

  const channel = useEntityField("sessions", sessionId, "channel") as { id: string } | null | undefined;
  const tool = useEntityField("sessions", sessionId, "tool") as string | undefined;
  const hosting = useEntityField("sessions", sessionId, "hosting") as string | undefined;
  const repo = useEntityField("sessions", sessionId, "repo") as { id: string } | null | undefined;
  const setActiveSessionId = useUIStore((s) => s.setActiveSessionId);

  const handleClearContext = useCallback(async () => {
    if (sending) return;
    setSending(true);
    try {
      const prompt = `Implement the following plan:\n\n${planContent}`;
      const result = await client
        .mutation(START_SESSION_MUTATION, {
          input: {
            tool: tool ?? "claude_code",
            hosting: hosting ?? "cloud",
            channelId: channel?.id,
            repoId: repo?.id,
            parentSessionId: sessionId,
            prompt,
          },
        })
        .toPromise();

      const newSessionId = result.data?.startSession?.id;
      if (newSessionId) {
        await client.mutation(RUN_SESSION_MUTATION, { id: newSessionId, prompt }).toPromise();
        setActiveSessionId(newSessionId);
      }
    } finally {
      setSending(false);
    }
  }, [sending, planContent, tool, hosting, channel?.id, repo?.id, sessionId, setActiveSessionId]);

  const handleKeepContext = useCallback(async () => {
    if (sending) return;
    setSending(true);
    try {
      await client.mutation(SEND_SESSION_MESSAGE_MUTATION, {
        sessionId,
        text: "Approved. Implement this plan.",
      }).toPromise();
    } finally {
      setSending(false);
    }
  }, [sessionId, sending]);

  const handleRevise = useCallback(async () => {
    const text = feedback.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await client.mutation(SEND_SESSION_MESSAGE_MUTATION, {
        sessionId,
        text: `Please revise the plan: ${text}`,
        interactionMode: "plan",
      }).toPromise();
      setFeedback("");
    } finally {
      setSending(false);
    }
  }, [sessionId, feedback, sending]);

  const handleSubmit = useCallback(() => {
    if (selected === "Approve (new session)") {
      handleClearContext();
    } else if (selected === "Approve (keep context)") {
      handleKeepContext();
    } else if (feedback.trim()) {
      handleRevise();
    }
  }, [selected, feedback, handleClearContext, handleKeepContext, handleRevise]);

  const hasAnswer = selected !== null || feedback.trim().length > 0;

  return (
    <div className="shrink-0 border-t border-accent/30 bg-surface px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-accent">
          Plan Review
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onDismiss}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-red-400 transition-colors"
          title="Dismiss"
        >
          <X size={14} />
        </button>
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {PRESETS.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              setSelected(selected === label ? null : label);
              setFeedback("");
            }}
            disabled={sending}
            className={cn(
              "min-h-8 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
              selected === label
                ? "border-accent bg-accent/20 text-accent"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-surface-elevated",
              sending && "opacity-50",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={feedback}
          onChange={(e) => {
            setFeedback(e.target.value);
            if (e.target.value) setSelected(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (feedback.trim()) {
                setSelected(null);
                handleRevise();
              }
            }
          }}
          placeholder="Suggest changes to revise the plan..."
          disabled={sending}
          className="flex-1 rounded-lg border border-border bg-surface-deep px-3 py-2 text-base md:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
        />
        <button
          type="button"
          disabled={!hasAnswer || sending}
          onClick={handleSubmit}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          <Send size={14} />
          {selected ? "Approve" : "Revise"}
        </button>
      </div>
    </div>
  );
}
