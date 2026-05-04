import { useState, useCallback } from "react";
import { Send, X } from "lucide-react";
import { gql } from "@urql/core";
import { client } from "../../lib/urql";
import {
  SEND_SESSION_MESSAGE_MUTATION,
  START_SESSION_MUTATION,
  RUN_SESSION_MUTATION,
  TERMINATE_SESSION_MUTATION,
  DISMISS_SESSION_MUTATION,
} from "@trace/client-core";
import { useEntityField } from "@trace/client-core";
import { navigateToSession, useUIStore } from "../../stores/ui";
import { optimisticallyInsertSession } from "../../lib/optimistic-session";
import { cn } from "../../lib/utils";
import { extractProjectPlanTicketDrafts } from "../../lib/projectPlanTickets";

export interface ProjectPlanningSessionContext {
  organizationId: string;
  projectId: string;
  projectRunId: string;
  onPlanApproved?: () => void | Promise<void>;
}

interface PlanResponseBarProps {
  sessionId: string;
  planContent: string;
  onDismiss: () => void;
  projectPlanningContext?: ProjectPlanningSessionContext | null;
}

const PRESETS = ["Approve (new session)", "Approve (keep context)"];

const UPDATE_PROJECT_PLAN_SUMMARY_MUTATION = gql`
  mutation SaveApprovedProjectPlan($input: UpdateProjectPlanSummaryInput!) {
    updateProjectPlanSummary(input: $input) {
      id
      status
      planSummary
      updatedAt
    }
  }
`;

const CREATE_PROJECT_TICKET_MUTATION = gql`
  mutation CreateProjectPlanTicket($input: CreateTicketInput!) {
    createTicket(input: $input) {
      id
      title
      description
      status
      priority
      labels
      createdAt
      updatedAt
    }
  }
`;

export function PlanResponseBar({
  sessionId,
  planContent,
  onDismiss,
  projectPlanningContext,
}: PlanResponseBarProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const handleApproveProjectPlan = useCallback(async () => {
    if (sending || !projectPlanningContext) return;
    setSending(true);
    setError(null);
    try {
      const ticketDrafts = extractProjectPlanTicketDrafts(planContent);
      const summaryResult = await client
        .mutation(UPDATE_PROJECT_PLAN_SUMMARY_MUTATION, {
          input: {
            projectRunId: projectPlanningContext.projectRunId,
            planSummary: planContent,
            status: "ready",
          },
        })
        .toPromise();

      if (summaryResult.error) throw summaryResult.error;

      for (const ticket of ticketDrafts) {
        const ticketResult = await client
          .mutation(CREATE_PROJECT_TICKET_MUTATION, {
            input: {
              organizationId: projectPlanningContext.organizationId,
              projectId: projectPlanningContext.projectId,
              title: ticket.title,
              description: ticket.description,
              priority: "medium",
              labels: ["project-plan"],
            },
          })
          .toPromise();
        if (ticketResult.error) throw ticketResult.error;
      }

      const dismissResult = await client
        .mutation(DISMISS_SESSION_MUTATION, { id: sessionId })
        .toPromise();
      if (dismissResult.error) throw dismissResult.error;
      await projectPlanningContext.onPlanApproved?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Project plan could not be approved.");
    } finally {
      setSending(false);
    }
  }, [planContent, projectPlanningContext, sending, sessionId]);

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
    } else if (selected === "Approve (new session)") {
      handleClearContext();
    } else if (selected === "Approve (keep context)") {
      handleKeepContext();
    } else if (feedback.trim()) {
      handleRevise();
    }
  }, [
    projectPlanningContext,
    selected,
    feedback,
    handleApproveProjectPlan,
    handleClearContext,
    handleKeepContext,
    handleRevise,
  ]);

  const hasAnswer =
    Boolean(projectPlanningContext) || selected !== null || feedback.trim().length > 0;
  const submitLabel = feedback.trim()
    ? "Revise"
    : projectPlanningContext
      ? "Approve plan"
      : selected
        ? "Approve"
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
          Approval saves this plan to the project and creates linked tickets. Implementation stays
          paused.
        </p>
      ) : (
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
      )}

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
          {submitLabel}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
