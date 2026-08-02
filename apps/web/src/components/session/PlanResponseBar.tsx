import { useState, useCallback, useMemo } from "react";
import { MessageSquareText, Send, X } from "lucide-react";
import { SEND_SESSION_MESSAGE_MUTATION } from "@trace/client-core";
import { client } from "../../lib/urql";
import { navigateToSession, useUIStore } from "../../stores/ui";
import { cn } from "../../lib/utils";
import type { MarkdownSteerCommentsByBlock } from "../ui/markdownSteering";
import {
  buildApproveWithCommentsPrompt,
  buildCommentPrompt,
  getCommentGroupIndex,
} from "./planCommentPrompts";
import { PendingRichTextInput } from "./PendingRichTextInput";
import { gql } from "@urql/core";

interface PlanResponseBarProps {
  sessionId: string;
  planContent: string;
  artifactId?: string;
  planComments?: MarkdownSteerCommentsByBlock;
  onClearPlanComments?: () => void;
  onDismiss: () => void;
}

const APPROVE_ARTIFACT_MUTATION = gql`
  mutation ApproveArtifact($artifactId: ID!, $action: ArtifactApprovalAction!, $prompt: String!) {
    approveArtifact(artifactId: $artifactId, action: $action, prompt: $prompt) {
      implementationSession {
        id
        sessionGroupId
        channel {
          id
        }
      }
    }
  }
`;

const APPROVE_NEW_SESSION = "Approve (new session)";
const APPROVE_KEEP_CONTEXT = "Approve (keep context)";
const PRESETS = [APPROVE_NEW_SESSION, APPROVE_KEEP_CONTEXT];

function getApprovalLabel(label: string, hasComments: boolean): string {
  if (!hasComments) return label;
  return label === APPROVE_NEW_SESSION
    ? "Approve with comments (new session)"
    : "Approve with comments (keep context)";
}

export function PlanResponseBar({
  sessionId,
  planContent,
  artifactId,
  planComments,
  onClearPlanComments,
  onDismiss,
}: PlanResponseBarProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);
  const commentGroups = useMemo(
    () =>
      Object.values(planComments ?? {})
        .filter((comments) => comments.length > 0)
        .sort((a, b) => getCommentGroupIndex(a) - getCommentGroupIndex(b)),
    [planComments],
  );
  const commentCount = commentGroups.reduce((sum, comments) => sum + comments.length, 0);
  const hasComments = commentCount > 0;
  const commentLabel = commentCount === 1 ? "1 comment" : `${commentCount} comments`;
  const openSessionTab = useUIStore(
    (s: { openSessionTab: (groupId: string, sessionId: string) => void }) => s.openSessionTab,
  );
  const approveArtifact = useCallback(
    async (action: "NEW_SESSION" | "KEEP_CONTEXT", prompt: string) => {
      if (!artifactId) throw new Error("The plan artifact is unavailable");
      const result = await client
        .mutation(APPROVE_ARTIFACT_MUTATION, { artifactId, action, prompt })
        .toPromise();
      if (result.error) throw result.error;
      const implementationSession = result.data?.approveArtifact?.implementationSession;
      if (!implementationSession?.id) throw new Error("Implementation session was not returned");
      return implementationSession;
    },
    [artifactId],
  );

  const handleClearContext = useCallback(
    async (noteOverride?: string) => {
      if (sending) return;
      setSending(true);
      try {
        const note = noteOverride ?? feedback;
        const prompt = hasComments
          ? buildApproveWithCommentsPrompt({
              planContent,
              commentGroups,
              note: note.trim(),
            })
          : `Implement the following plan:\n\n${planContent}`;
        const implementationSession = await approveArtifact("NEW_SESSION", prompt);
        if (implementationSession.sessionGroupId) {
          openSessionTab(implementationSession.sessionGroupId, implementationSession.id);
          navigateToSession(
            implementationSession.channel?.id ?? null,
            implementationSession.sessionGroupId,
            implementationSession.id,
          );
        }
        if (hasComments) {
          setFeedback("");
          onClearPlanComments?.();
        }
      } finally {
        setSending(false);
      }
    },
    [
      sending,
      planContent,
      hasComments,
      commentGroups,
      feedback,
      onClearPlanComments,
      openSessionTab,
      approveArtifact,
    ],
  );

  const handleKeepContext = useCallback(
    async (noteOverride?: string) => {
      if (sending) return;
      setSending(true);
      try {
        const note = noteOverride ?? feedback;
        const prompt = hasComments
          ? buildApproveWithCommentsPrompt({
              commentGroups,
              note: note.trim(),
            })
          : "Approved. Implement this plan.";
        await approveArtifact("KEEP_CONTEXT", prompt);
        if (hasComments) {
          setFeedback("");
          onClearPlanComments?.();
        }
      } finally {
        setSending(false);
      }
    },
    [commentGroups, feedback, hasComments, onClearPlanComments, approveArtifact, sending],
  );

  const handleRevise = useCallback(
    async (textOverride?: string) => {
      const text = (textOverride ?? feedback).trim();
      if ((!text && !hasComments) || sending) return;
      setSending(true);
      try {
        await client
          .mutation(SEND_SESSION_MESSAGE_MUTATION, {
            sessionId,
            text: hasComments
              ? buildCommentPrompt(commentGroups, text)
              : `Please revise the plan: ${text}`,
            interactionMode: "plan",
          })
          .toPromise();
        setFeedback("");
        if (hasComments) onClearPlanComments?.();
      } finally {
        setSending(false);
      }
    },
    [commentGroups, feedback, hasComments, onClearPlanComments, sending, sessionId],
  );

  const handleApprovalClick = useCallback(
    (label: string) => {
      if (hasComments) {
        if (label === APPROVE_NEW_SESSION) {
          void handleClearContext();
        } else {
          void handleKeepContext();
        }
        return;
      }

      setSelected(selected === label ? null : label);
      setFeedback("");
    },
    [hasComments, handleClearContext, handleKeepContext, selected],
  );

  const handleSubmit = useCallback(
    (textOverride?: string) => {
      const text = textOverride ?? feedback;
      if (!hasComments && selected === APPROVE_NEW_SESSION) {
        void handleClearContext(text);
      } else if (!hasComments && selected === APPROVE_KEEP_CONTEXT) {
        void handleKeepContext(text);
      } else if ((textOverride ?? feedback).trim() || hasComments) {
        void handleRevise(text);
      }
    },
    [feedback, hasComments, selected, handleClearContext, handleKeepContext, handleRevise],
  );

  const hasAnswer = selected !== null || feedback.trim().length > 0 || hasComments;
  const primaryLabel = hasComments ? "Send comments" : selected ? "Approve" : "Revise";

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
          <span>{commentLabel} ready for revision or approval.</span>
        </div>
      )}

      <div className="mb-2 flex flex-wrap gap-1.5">
        {PRESETS.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => handleApprovalClick(label)}
            disabled={sending}
            className={cn(
              "min-h-8 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
              hasComments
                ? "border-accent/35 bg-accent/10 text-accent hover:bg-accent/15"
                : selected === label
                  ? "border-accent bg-accent/20 text-accent"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-surface-elevated",
              sending && "opacity-50",
            )}
          >
            {getApprovalLabel(label, hasComments)}
          </button>
        ))}
      </div>

      <div className="flex items-end gap-2">
        <PendingRichTextInput
          value={feedback}
          resetKey={selected ?? "feedback"}
          onChange={(text) => {
            setFeedback(text);
            if (text && !hasComments) setSelected(null);
          }}
          onSubmit={(text) => {
            if (hasAnswer) handleSubmit(text);
          }}
          placeholder={
            hasComments
              ? "Optional note to include with comments..."
              : "Suggest changes to revise the plan..."
          }
          disabled={sending}
          submitLabel={primaryLabel}
          SubmitIcon={Send}
          submitDisabled={!hasAnswer}
          allowEmptySubmit
        />
      </div>
    </div>
  );
}
