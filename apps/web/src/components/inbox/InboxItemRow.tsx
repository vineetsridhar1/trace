import { useState, useCallback } from "react";
import { Play, PlayCircle, X, Send, MessageCircleQuestion, Map, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { client } from "../../lib/urql";
import { Markdown } from "../ui/Markdown";
import {
  SEND_SESSION_MESSAGE_MUTATION,
  START_SESSION_MUTATION,
  RUN_SESSION_MUTATION,
  TERMINATE_SESSION_MUTATION,
} from "../../lib/mutations";
import { useEntityField } from "../../stores/entity";
import { useUIStore } from "../../stores/ui";
import { cn } from "../../lib/utils";
import { gql } from "@urql/core";

const DISMISS_INBOX_ITEM_MUTATION = gql`
  mutation DismissInboxItem($id: ID!) {
    dismissInboxItem(id: $id) {
      id
    }
  }
`;

interface InboxItemRowProps {
  id: string;
}

interface QuestionOption {
  label: string;
  description: string;
}

interface QuestionData {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function InboxItemRow({ id }: InboxItemRowProps) {
  const title = useEntityField("inboxItems", id, "title");
  const itemType = useEntityField("inboxItems", id, "itemType");
  const status = useEntityField("inboxItems", id, "status");
  const createdAt = useEntityField("inboxItems", id, "createdAt");
  const payload = useEntityField("inboxItems", id, "payload") as Record<string, unknown> | undefined;
  const sourceId = useEntityField("inboxItems", id, "sourceId");

  const sessionChannel = useEntityField("sessions", sourceId ?? "", "channel") as { id: string } | null | undefined;
  const sessionTool = useEntityField("sessions", sourceId ?? "", "tool") as string | undefined;
  const sessionHosting = useEntityField("sessions", sourceId ?? "", "hosting") as string | undefined;
  const sessionRepo = useEntityField("sessions", sourceId ?? "", "repo") as { id: string } | null | undefined;
  const sessionBranch = useEntityField("sessions", sourceId ?? "", "branch") as string | null | undefined;

  const setActivePage = useUIStore((s) => s.setActivePage);
  const setActiveChannelId = useUIStore((s) => s.setActiveChannelId);
  const setActiveSessionId = useUIStore((s) => s.setActiveSessionId);

  const [sending, setSending] = useState(false);

  const isQuestion = itemType === "question";
  const isResolved = status === "resolved" || status === "dismissed";
  const planContent = (payload?.planContent as string) ?? "";
  const questions = (payload?.questions as QuestionData[] | undefined) ?? [];
  const resolution = (payload?.resolution as string) ?? "";

  const handleNavigate = useCallback(() => {
    if (!sourceId) return;
    if (sessionChannel?.id) {
      setActiveChannelId(sessionChannel.id);
    }
    setActiveSessionId(sourceId);
    setActivePage("main");
  }, [sourceId, sessionChannel?.id, setActiveChannelId, setActiveSessionId, setActivePage]);

  const handleApproveNewSession = useCallback(async () => {
    if (sending || !sourceId) return;
    setSending(true);
    try {
      const prompt = planContent
        ? `Implement the following plan:\n\n${planContent}`
        : "Implement the plan from the previous session.";
      const result = await client
        .mutation(START_SESSION_MUTATION, {
          input: {
            tool: sessionTool ?? "claude_code",
            hosting: sessionHosting ?? "cloud",
            channelId: sessionChannel?.id,
            repoId: sessionRepo?.id,
            branch: sessionBranch ?? undefined,
            parentSessionId: sourceId,
            prompt,
          },
        })
        .toPromise();

      const newSessionId = result.data?.startSession?.id;
      if (newSessionId) {
        await client.mutation(RUN_SESSION_MUTATION, { id: newSessionId, prompt }).toPromise();
        if (sessionChannel?.id) setActiveChannelId(sessionChannel.id);
        setActiveSessionId(newSessionId);
        setActivePage("main");
      }
    } finally {
      setSending(false);
    }
  }, [sending, sourceId, planContent, sessionTool, sessionHosting, sessionChannel?.id, sessionRepo?.id, sessionBranch, setActiveChannelId, setActiveSessionId, setActivePage]);

  const handleApproveKeepContext = useCallback(async () => {
    if (sending || !sourceId) return;
    setSending(true);
    try {
      await client.mutation(SEND_SESSION_MESSAGE_MUTATION, {
        sessionId: sourceId,
        text: "Approved. Implement this plan.",
      }).toPromise();
    } finally {
      setSending(false);
    }
  }, [sending, sourceId]);

  const handleDismiss = useCallback(async () => {
    if (sending) return;
    setSending(true);
    try {
      await client.mutation(DISMISS_INBOX_ITEM_MUTATION, { id }).toPromise();
      // Also terminate the session so it leaves needs_input
      if (sourceId) {
        await client.mutation(TERMINATE_SESSION_MUTATION, { id: sourceId }).toPromise();
      }
    } finally {
      setSending(false);
    }
  }, [sending, id, sourceId]);

  const handleSendMessage = useCallback(async (text: string, interactionMode?: string) => {
    if (!text.trim() || sending || !sourceId) return;
    setSending(true);
    try {
      await client.mutation(SEND_SESSION_MESSAGE_MUTATION, {
        sessionId: sourceId,
        text,
        interactionMode,
      }).toPromise();
    } finally {
      setSending(false);
    }
  }, [sending, sourceId]);

  if (!title) return null;

  // ── Resolved / Dismissed state ──
  if (isResolved) {
    return (
      <div
        className="flex cursor-pointer items-center gap-2.5 border-b border-border/50 px-4 py-2 opacity-60 transition-colors hover:bg-surface-elevated"
        onClick={handleNavigate}
      >
        <Check size={14} className="shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-medium text-muted-foreground">{title}</span>
            <span className="shrink-0 text-[10px] text-muted-foreground/70">
              {createdAt ? timeAgo(createdAt) : ""}
            </span>
          </div>
          <p className="truncate text-[11px] text-muted-foreground/80">
            {status === "dismissed" ? "Dismissed" : resolution || "Resolved"}
          </p>
        </div>
      </div>
    );
  }

  // ── Active state ──
  return (
    <div className="border-b border-border last:border-b-0">
      {/* Header */}
      <div
        className="flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-elevated"
        onClick={handleNavigate}
      >
        <div className="mt-0.5 shrink-0 text-muted-foreground">
          {isQuestion ? <MessageCircleQuestion size={16} /> : <Map size={16} className="text-accent" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{title}</span>
            <span className="shrink-0 rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {isQuestion ? "Question" : "Plan"}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {createdAt ? timeAgo(createdAt) : ""}
            </span>
          </div>
        </div>
      </div>

      {/* Type-specific body */}
      {isQuestion ? (
        <QuestionBody
          questions={questions}
          sending={sending}
          onSend={handleSendMessage}
          onDismiss={handleDismiss}
        />
      ) : (
        <PlanBody
          planContent={planContent}
          sending={sending}
          onApproveNew={handleApproveNewSession}
          onApproveKeep={handleApproveKeepContext}
          onRevise={(text) => handleSendMessage(`Please revise the plan: ${text}`, "plan")}
          onDismiss={handleDismiss}
        />
      )}
    </div>
  );
}

// ── Plan Body ──

function PlanBody({
  planContent,
  sending,
  onApproveNew,
  onApproveKeep,
  onRevise,
  onDismiss,
}: {
  planContent: string;
  sending: boolean;
  onApproveNew: () => void;
  onApproveKeep: () => void;
  onRevise: (text: string) => void;
  onDismiss: () => void;
}) {
  const [reviseText, setReviseText] = useState("");

  return (
    <div className="px-4 pb-3">
      {/* Full plan content — matches PlanReviewCard styling */}
      {planContent && (
        <div className="accent-dashed-container mb-2 max-h-96 overflow-y-auto px-4 py-3">
          <Markdown>{planContent}</Markdown>
        </div>
      )}

      {/* Action buttons */}
      <div className="mb-2 flex items-center gap-1.5">
        <button
          type="button"
          disabled={sending}
          onClick={(e) => { e.stopPropagation(); onApproveNew(); }}
          className={cn(
            "flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium transition-colors",
            "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
            sending && "opacity-50",
          )}
        >
          <PlayCircle size={12} />
          New session
        </button>
        <button
          type="button"
          disabled={sending}
          onClick={(e) => { e.stopPropagation(); onApproveKeep(); }}
          className={cn(
            "flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium transition-colors",
            "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
            sending && "opacity-50",
          )}
        >
          <Play size={12} />
          Keep context
        </button>
        <button
          type="button"
          disabled={sending}
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          className={cn(
            "flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium transition-colors",
            "text-muted-foreground hover:bg-surface-elevated hover:text-red-400",
            sending && "opacity-50",
          )}
        >
          <X size={12} />
          Dismiss
        </button>
      </div>

      {/* Revise input */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={reviseText}
          onChange={(e) => setReviseText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && reviseText.trim()) {
              e.preventDefault();
              onRevise(reviseText.trim());
              setReviseText("");
            }
          }}
          placeholder="Suggest changes to revise the plan..."
          disabled={sending}
          className="flex-1 rounded-lg border border-border bg-surface-deep px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
          onClick={(e) => e.stopPropagation()}
        />
        <button
          type="button"
          disabled={!reviseText.trim() || sending}
          onClick={(e) => { e.stopPropagation(); onRevise(reviseText.trim()); setReviseText(""); }}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          <Send size={12} />
          Revise
        </button>
      </div>
    </div>
  );
}

// ── Question Body ──

function QuestionBody({
  questions,
  sending,
  onSend,
  onDismiss,
}: {
  questions: QuestionData[];
  sending: boolean;
  onSend: (text: string) => void;
  onDismiss: () => void;
}) {
  const total = questions.length;
  const [page, setPage] = useState(0);
  const [selections, setSelections] = useState<Record<number, Set<string>>>({});
  const [customTexts, setCustomTexts] = useState<Record<number, string>>({});

  const q = questions[page];
  if (!q) return null;

  const currentSelected = selections[page] ?? new Set<string>();
  const currentCustom = customTexts[page] ?? "";
  const isLastPage = page === total - 1;
  const isFirstPage = page === 0;

  const hasAllAnswers = Array.from({ length: total }, (_, i) => {
    const sel = selections[i];
    const custom = (customTexts[i] ?? "").trim();
    return (sel && sel.size > 0) || custom.length > 0;
  }).every(Boolean);

  const toggleOption = (label: string) => {
    setSelections((prev) => {
      const current = prev[page] ?? new Set<string>();
      const next = new Set(current);
      if (q.multiSelect) {
        if (next.has(label)) next.delete(label);
        else next.add(label);
      } else {
        if (next.has(label)) next.clear();
        else { next.clear(); next.add(label); }
      }
      return { ...prev, [page]: next };
    });
  };

  const setCustomText = (text: string) => {
    setCustomTexts((prev) => ({ ...prev, [page]: text }));
  };

  const buildResponse = (): string | null => {
    const parts: string[] = [];
    for (let i = 0; i < total; i++) {
      const qi = questions[i];
      const selected = selections[i];
      const custom = (customTexts[i] ?? "").trim();
      if (custom) {
        parts.push(`${qi.header}: ${custom}`);
      } else if (selected && selected.size > 0) {
        parts.push(`${qi.header}: ${[...selected].join(", ")}`);
      }
    }
    return parts.length > 0 ? parts.join("\n") : null;
  };

  const handleSubmit = () => {
    const response = buildResponse();
    if (response) onSend(response);
  };

  return (
    <div className="px-4 pb-3">
      {/* Question header + pagination */}
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-accent">
          {q.header}
        </span>
        {total > 1 && (
          <span className="text-[11px] text-muted-foreground">
            {page + 1}/{total}
          </span>
        )}
      </div>

      {/* Question text */}
      <p className="mb-2 text-sm text-foreground">{q.question}</p>

      {/* Option pills */}
      {q.options.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {q.options.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={(e) => { e.stopPropagation(); toggleOption(opt.label); }}
              disabled={sending}
              title={opt.description}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                currentSelected.has(opt.label)
                  ? "border-accent bg-accent/20 text-accent"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-surface-elevated",
                sending && "opacity-50",
              )}
            >
              {q.multiSelect ? (
                <span className={cn(
                  "flex h-3 w-3 shrink-0 items-center justify-center rounded border",
                  currentSelected.has(opt.label) ? "border-accent bg-accent" : "border-muted-foreground",
                )}>
                  {currentSelected.has(opt.label) && (
                    <svg className="h-2 w-2 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
              ) : (
                <span className={cn(
                  "flex h-3 w-3 shrink-0 items-center justify-center rounded-full border",
                  currentSelected.has(opt.label) ? "border-accent" : "border-muted-foreground",
                )}>
                  {currentSelected.has(opt.label) && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                </span>
              )}
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Input + nav + actions */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={currentCustom}
          onChange={(e) => setCustomText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (hasAllAnswers) handleSubmit();
            }
          }}
          placeholder="Other..."
          disabled={sending}
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface-deep px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
          onClick={(e) => e.stopPropagation()}
        />

        {total > 1 && (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); if (!isFirstPage) setPage((p) => p - 1); }}
              disabled={isFirstPage}
              className="rounded-md border border-border px-1.5 py-1.5 text-foreground disabled:opacity-50"
            >
              <ChevronLeft size={12} />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); if (!isLastPage) setPage((p) => p + 1); }}
              disabled={isLastPage}
              className="rounded-md border border-border px-1.5 py-1.5 text-foreground disabled:opacity-50"
            >
              <ChevronRight size={12} />
            </button>
          </div>
        )}

        <button
          type="button"
          disabled={!hasAllAnswers || sending}
          onClick={(e) => { e.stopPropagation(); handleSubmit(); }}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          <Send size={12} />
          Reply
        </button>

        <button
          type="button"
          disabled={sending}
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          className={cn(
            "flex items-center rounded-md border border-border px-1.5 py-1.5 text-xs transition-colors",
            "text-muted-foreground hover:bg-surface-elevated hover:text-red-400",
            sending && "opacity-50",
          )}
          title="Dismiss"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
