import { useState, useCallback, memo } from "react";
import { MessageCircleQuestion, Map, Check } from "lucide-react";
import { client } from "../../lib/urql";
import {
  SEND_SESSION_MESSAGE_MUTATION,
  START_SESSION_MUTATION,
  RUN_SESSION_MUTATION,
  DISMISS_SESSION_MUTATION,
  DISMISS_INBOX_ITEM_MUTATION,
  TERMINATE_SESSION_MUTATION,
} from "@trace/client-core";
import { useEntityField } from "@trace/client-core";
import { navigateToSession, useUIStore } from "../../stores/ui";
import { optimisticallyInsertSession } from "../../lib/optimistic-session";
import { InboxPlanBody } from "./InboxPlanBody";
import { InboxQuestionBody } from "./InboxQuestionBody";
import type { QuestionData } from "./InboxQuestionBody";

/** Human-friendly label for inbox item types. */
function itemTypeLabel(itemType: string | undefined): string {
  if (!itemType) return "";
  if (itemType === "question") return "Question";
  if (itemType === "plan") return "Plan";
  return itemType;
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

export const InboxItemRow = memo(function InboxItemRow({ id }: { id: string }) {
  const title = useEntityField("inboxItems", id, "title");
  const itemType = useEntityField("inboxItems", id, "itemType");
  const status = useEntityField("inboxItems", id, "status");
  const createdAt = useEntityField("inboxItems", id, "createdAt");
  const payload = useEntityField("inboxItems", id, "payload") as
    | Record<string, unknown>
    | undefined;
  const sourceId = useEntityField("inboxItems", id, "sourceId");

  const sessionChannel = useEntityField("sessions", sourceId ?? "", "channel") as
    | { id: string }
    | null
    | undefined;
  const sessionTool = useEntityField("sessions", sourceId ?? "", "tool") as string | undefined;
  const sessionModel = useEntityField("sessions", sourceId ?? "", "model") as
    | string
    | null
    | undefined;
  const sessionReasoningEffort = useEntityField(
    "sessions",
    sourceId ?? "",
    "reasoningEffort",
  ) as string | null | undefined;
  const sessionHosting = useEntityField("sessions", sourceId ?? "", "hosting") as
    | string
    | undefined;
  const sessionGroupId = useEntityField("sessions", sourceId ?? "", "sessionGroupId") as
    | string
    | undefined;
  const sessionRepo = useEntityField("sessions", sourceId ?? "", "repo") as
    | { id: string }
    | null
    | undefined;
  const sessionBranch = useEntityField("sessions", sourceId ?? "", "branch") as
    | string
    | null
    | undefined;

  const openSessionTab = useUIStore(
    (s: { openSessionTab: (groupId: string, sessionId: string) => void }) => s.openSessionTab,
  );
  const [sending, setSending] = useState(false);

  const isQuestion = itemType === "question";
  const isResolved = status === "resolved" || status === "dismissed" || status === "expired";
  const planContent = (payload?.planContent as string) ?? "";
  const questions = (payload?.questions as QuestionData[] | undefined) ?? [];
  const resolution = (payload?.resolution as string) ?? "";

  const handleNavigate = useCallback(() => {
    if (!sourceId || !sessionGroupId) return;
    navigateToSession(sessionChannel?.id ?? null, sessionGroupId, sourceId);
  }, [sourceId, sessionChannel?.id, sessionGroupId]);

  const handleApproveNewSession = useCallback(async () => {
    if (sending || !sourceId || !sessionGroupId) return;
    setSending(true);
    try {
      const prompt = planContent
        ? `Implement the following plan:\n\n${planContent}`
        : "Implement the plan from the previous session.";
      const result = await client
        .mutation(START_SESSION_MUTATION, {
          input: {
            tool: sessionTool ?? "claude_code",
            model: sessionModel ?? undefined,
            reasoningEffort: sessionReasoningEffort ?? undefined,
            hosting: sessionHosting ?? "cloud",
            channelId: sessionChannel?.id,
            repoId: sessionRepo?.id,
            branch: sessionBranch ?? undefined,
            sessionGroupId,
            sourceSessionId: sourceId,
            prompt,
          },
        })
        .toPromise();

      const newSessionId = result.data?.startSession?.id;
      if (newSessionId) {
        optimisticallyInsertSession({
          id: newSessionId,
          sessionGroupId,
          tool: sessionTool ?? "claude_code",
          model: sessionModel,
          reasoningEffort: sessionReasoningEffort,
          hosting: sessionHosting ?? "cloud",
          channel: sessionChannel,
          repo: sessionRepo,
          branch: sessionBranch,
        });
        await client.mutation(RUN_SESSION_MUTATION, { id: newSessionId, prompt }).toPromise();
        openSessionTab(sessionGroupId, newSessionId);
        navigateToSession(sessionChannel?.id ?? null, sessionGroupId, newSessionId);
        await client.mutation(TERMINATE_SESSION_MUTATION, { id: sourceId }).toPromise();
      }
    } finally {
      setSending(false);
    }
  }, [
    sending,
    sourceId,
    planContent,
    sessionTool,
    sessionModel,
    sessionReasoningEffort,
    sessionHosting,
    sessionChannel?.id,
    sessionRepo?.id,
    sessionBranch,
    sessionGroupId,
    openSessionTab,
  ]);

  const handleApproveKeepContext = useCallback(async () => {
    if (sending || !sourceId) return;
    setSending(true);
    try {
      await client
        .mutation(SEND_SESSION_MESSAGE_MUTATION, {
          sessionId: sourceId,
          text: "Approved. Implement this plan.",
        })
        .toPromise();
    } finally {
      setSending(false);
    }
  }, [sending, sourceId]);

  const handleDismiss = useCallback(async () => {
    if (sending) return;
    setSending(true);
    try {
      await client.mutation(DISMISS_INBOX_ITEM_MUTATION, { id }).toPromise();
      if (sourceId) {
        await client.mutation(DISMISS_SESSION_MUTATION, { id: sourceId }).toPromise();
      }
    } finally {
      setSending(false);
    }
  }, [sending, id, sourceId]);

  const handleSendMessage = useCallback(
    async (text: string, interactionMode?: string) => {
      if (!text.trim() || sending || !sourceId) return;
      setSending(true);
      try {
        await client
          .mutation(SEND_SESSION_MESSAGE_MUTATION, {
            sessionId: sourceId,
            text,
            interactionMode,
          })
          .toPromise();
      } finally {
        setSending(false);
      }
    },
    [sending, sourceId],
  );

  if (!title) return null;

  // ── Resolved / Dismissed / Expired state ──
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
            {status === "dismissed"
              ? "Dismissed"
              : status === "expired"
                ? "Expired"
                : resolution || "Resolved"}
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
          {isQuestion ? (
            <MessageCircleQuestion size={16} />
          ) : (
            <Map size={16} className="text-accent" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{title}</span>
            <span className="shrink-0 rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {itemTypeLabel(itemType as string | undefined)}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {createdAt ? timeAgo(createdAt) : ""}
            </span>
          </div>
        </div>
      </div>

      {/* Type-specific body */}
      {isQuestion ? (
        <InboxQuestionBody
          questions={questions}
          sending={sending}
          onSend={handleSendMessage}
          onDismiss={handleDismiss}
        />
      ) : (
        <InboxPlanBody
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
});
