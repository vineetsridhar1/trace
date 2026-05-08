import { useState, useCallback, useMemo } from "react";
import { MessageSquareText, Send, X } from "lucide-react";
import { client } from "../../lib/urql";
import {
  SEND_SESSION_MESSAGE_MUTATION,
  START_SESSION_MUTATION,
  RUN_SESSION_MUTATION,
  TERMINATE_SESSION_MUTATION,
} from "@trace/client-core";
import { useEntityField } from "@trace/client-core";
import { navigateToSession, useUIStore } from "../../stores/ui";
import { optimisticallyInsertSession } from "../../lib/optimistic-session";
import { cn } from "../../lib/utils";
import type { MarkdownSteerComment } from "../ui/markdownSteering";

interface PlanResponseBarProps {
  sessionId: string;
  planContent: string;
  planComments?: Record<string, MarkdownSteerComment>;
  onClearPlanComments?: () => void;
  onDismiss: () => void;
}

const PRESETS = ["Approve (new session)", "Approve (keep context)"];

function getCommentIndex(comment: MarkdownSteerComment): number {
  const [index] = comment.id.split("-");
  const parsed = Number(index);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildCommentPrompt(comments: MarkdownSteerComment[], note: string): string {
  const commentText = comments
    .map(
      (comment, index) =>
        `Comment ${index + 1}\n\nSelected plan block:\n${comment.markdown}\n\nComment:\n${comment.text}`,
    )
    .join("\n\n---\n\n");
  const noteText = note ? `\n\nOverall note:\n${note}` : "";

  return `Please revise the plan using these inline comments. Apply them together, keep the rest of the plan coherent, and do not start implementation yet.\n\n${commentText}${noteText}`;
}

export function PlanResponseBar({
  sessionId,
  planContent,
  planComments,
  onClearPlanComments,
  onDismiss,
}: PlanResponseBarProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);
  const commentList = useMemo(
    () =>
      Object.values(planComments ?? {}).sort((a, b) => getCommentIndex(a) - getCommentIndex(b)),
    [planComments],
  );
  const commentCount = commentList.length;
  const hasComments = commentCount > 0;
  const commentLabel = commentCount === 1 ? "1 comment" : `${commentCount} comments`;
  const openSessionTab = useUIStore(
    (s: { openSessionTab: (groupId: string, sessionId: string) => void }) => s.openSessionTab,
  );
  const channel = useEntityField("sessions", sessionId, "channel") as
    | { id: string }
    | null
    | undefined;
  const sessionGroupId = useEntityField("sessions", sessionId, "sessionGroupId") as
    | string
    | undefined;
  const tool = useEntityField("sessions", sessionId, "tool") as string | undefined;
  const model = useEntityField("sessions", sessionId, "model") as string | undefined;
  const reasoningEffort = useEntityField("sessions", sessionId, "reasoningEffort") as
    | string
    | undefined;
  const hosting = useEntityField("sessions", sessionId, "hosting") as string | undefined;
  const repo = useEntityField("sessions", sessionId, "repo") as { id: string } | null | undefined;
  const branch = useEntityField("sessions", sessionId, "branch") as string | undefined;
  const defaultHosting = hosting ?? "local";

  const handleClearContext = useCallback(async () => {
    if (sending || !sessionGroupId) return;
    setSending(true);
    try {
      const prompt = `Implement the following plan:\n\n${planContent}`;
      const result = await client
        .mutation(START_SESSION_MUTATION, {
          input: {
            tool: tool ?? "claude_code",
            model,
            reasoningEffort,
            hosting: defaultHosting,
            channelId: channel?.id,
            repoId: repo?.id,
            branch,
            sessionGroupId,
            sourceSessionId: sessionId,
            prompt,
          },
        })
        .toPromise();

      const newSessionId = result.data?.startSession?.id;
      if (newSessionId) {
        optimisticallyInsertSession({
          id: newSessionId,
          sessionGroupId,
          tool: tool ?? "claude_code",
          model,
          reasoningEffort,
          hosting: defaultHosting,
          channel,
          repo,
          branch,
        });
        await client.mutation(RUN_SESSION_MUTATION, { id: newSessionId, prompt }).toPromise();
        openSessionTab(sessionGroupId, newSessionId);
        navigateToSession(channel?.id ?? null, sessionGroupId, newSessionId);
        await client.mutation(TERMINATE_SESSION_MUTATION, { id: sessionId }).toPromise();
      }
    } finally {
      setSending(false);
    }
  }, [
    sending,
    sessionGroupId,
    planContent,
    tool,
    model,
    defaultHosting,
    channel?.id,
    repo?.id,
    branch,
    sessionId,
    openSessionTab,
  ]);

  const handleKeepContext = useCallback(async () => {
    if (sending) return;
    setSending(true);
    try {
      await client
        .mutation(SEND_SESSION_MESSAGE_MUTATION, {
          sessionId,
          text: "Approved. Implement this plan.",
        })
        .toPromise();
    } finally {
      setSending(false);
    }
  }, [sessionId, sending]);

  const handleRevise = useCallback(async () => {
    const text = feedback.trim();
    if ((!text && !hasComments) || sending) return;
    setSending(true);
    try {
      await client
        .mutation(SEND_SESSION_MESSAGE_MUTATION, {
          sessionId,
          text: hasComments
            ? buildCommentPrompt(commentList, text)
            : `Please revise the plan: ${text}`,
          interactionMode: "plan",
        })
        .toPromise();
      setFeedback("");
      if (hasComments) onClearPlanComments?.();
    } finally {
      setSending(false);
    }
  }, [commentList, feedback, hasComments, onClearPlanComments, sending, sessionId]);

  const handleSubmit = useCallback(() => {
    if (selected === "Approve (new session)") {
      handleClearContext();
    } else if (selected === "Approve (keep context)") {
      handleKeepContext();
    } else if (feedback.trim() || hasComments) {
      handleRevise();
    }
  }, [selected, feedback, hasComments, handleClearContext, handleKeepContext, handleRevise]);

  const hasAnswer = selected !== null || feedback.trim().length > 0 || hasComments;
  const primaryLabel = selected ? "Approve" : hasComments ? "Send comments" : "Revise";

  return (
    <div className="shrink-0 border-t border-accent/30 bg-surface px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-accent">
          Plan Review
        </span>
        {hasComments && (
          <span className="rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
            {commentLabel}
          </span>
        )}
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

      {hasComments && (
        <div className="mb-2 flex items-center gap-1.5 rounded-md border border-accent/20 bg-accent/5 px-2 py-1.5 text-xs text-muted-foreground">
          <MessageSquareText size={13} className="text-accent" />
          <span>{commentLabel} ready to send with this plan revision.</span>
        </div>
      )}

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
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setFeedback(e.target.value);
            if (e.target.value) setSelected(null);
          }}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (feedback.trim() || hasComments) {
                setSelected(null);
                handleRevise();
              }
            }
          }}
          placeholder={
            hasComments
              ? "Optional note to include with comments..."
              : "Suggest changes to revise the plan..."
          }
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
          {primaryLabel}
        </button>
      </div>
    </div>
  );
}
