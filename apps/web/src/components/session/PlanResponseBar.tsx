import { useState, useCallback } from "react";
import { Send, X } from "lucide-react";
import { gql } from "@urql/core";
import { client } from "../../lib/urql";
import { SEND_SESSION_MESSAGE_MUTATION } from "@trace/client-core";

export interface ProjectPlanningSessionContext {
  organizationId: string;
  projectId: string;
  projectRunId: string;
}

interface PlanResponseBarProps {
  sessionId: string;
  planContent: string;
  onDismiss: () => void;
  onApproved?: () => void | Promise<void>;
  projectPlanningContext?: ProjectPlanningSessionContext | null;
}

const APPROVE_PROJECT_PLAN_MUTATION = gql`
  mutation ApproveProjectPlan($input: ApproveProjectPlanInput!) {
    approveProjectPlan(input: $input) {
      id
      status
      projectRunId
      draftCount
      createdTicketIds
      error
      updatedAt
    }
  }
`;

export function PlanResponseBar({
  sessionId,
  planContent,
  onDismiss,
  onApproved,
  projectPlanningContext,
}: PlanResponseBarProps) {
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApproveProjectPlan = useCallback(async () => {
    if (sending || !projectPlanningContext) return;
    setSending(true);
    setError(null);
    try {
      const result = await client
        .mutation(APPROVE_PROJECT_PLAN_MUTATION, {
          input: {
            projectRunId: projectPlanningContext.projectRunId,
            planSummary: planContent,
          },
        })
        .toPromise();

      if (result.error) throw result.error;
      const attempt = result.data?.approveProjectPlan as
        | {
            status?: string;
            error?: string | null;
            createdTicketIds?: string[] | null;
          }
        | undefined;
      await onApproved?.();
      const createdCount = attempt?.createdTicketIds?.length ?? 0;
      if (
        attempt?.status === "failed" ||
        (attempt?.status === "partial_failed" && createdCount === 0)
      ) {
        setError(attempt.error ?? "Ticket generation failed. Update the plan and try again.");
        return;
      }
      if (attempt?.status === "pending") {
        setError("Ticket generation is queued. Wait for the planning session to reconnect.");
        return;
      }
      if (attempt?.status === "completed" && createdCount === 0) {
        setError(
          "Ticket generation completed without creating tickets. Update the plan and try again.",
        );
        return;
      }
      onDismiss();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Project plan could not be approved.");
    } finally {
      setSending(false);
    }
  }, [onApproved, onDismiss, planContent, projectPlanningContext, sending]);

  const handleRevise = useCallback(async () => {
    const text = feedback.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await client
        .mutation(SEND_SESSION_MESSAGE_MUTATION, {
          sessionId,
          text: `Please revise the plan: ${text}`,
          interactionMode: "plan",
        })
        .toPromise();
      setFeedback("");
    } finally {
      setSending(false);
    }
  }, [sessionId, feedback, sending]);

  const handleSubmit = useCallback(() => {
    if (projectPlanningContext && feedback.trim()) {
      handleRevise();
    } else if (projectPlanningContext) {
      handleApproveProjectPlan();
    } else if (feedback.trim()) {
      handleRevise();
    }
  }, [projectPlanningContext, feedback, handleApproveProjectPlan, handleRevise]);

  const hasAnswer = Boolean(projectPlanningContext) || feedback.trim().length > 0;
  const submitLabel = feedback.trim()
    ? "Revise"
    : projectPlanningContext
      ? "Approve plan"
      : "Revise";

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

      {projectPlanningContext ? (
        <p className="mb-2 text-xs text-muted-foreground">
          Approval tells the planning AI to create Trace tickets with the injected ticket CLI.
          Tickets appear here as the backend emits creation events.
        </p>
      ) : (
        <p className="mb-2 text-xs text-muted-foreground">
          Add feedback to revise this plan before implementation starts elsewhere.
        </p>
      )}

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={feedback}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setFeedback(e.target.value);
          }}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (feedback.trim()) {
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
          {submitLabel}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
