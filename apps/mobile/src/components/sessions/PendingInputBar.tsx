import { useEffect, useMemo, useState } from "react";
import {
  eventScopeKey,
  getAuthHeaders,
  useEntityField,
  useEntityStore,
  useScopedEventIds,
  useScopedEvents,
} from "@trace/client-core";
import type { Artifact } from "@trace/gql";
import { getActiveApiUrl } from "@/lib/connection-target";
import { findMostRecentPendingInput } from "@/lib/pending-input";
import { visualPlanHtmlPath } from "@/lib/visual-plan-file";
import { PendingInputPlan } from "./PendingInputPlan";
import { PendingInputQuestion } from "./PendingInputQuestion";

interface PendingInputBarProps {
  sessionId: string;
  keyboardVisible?: boolean;
}

/**
 * Bottom-pinned bar that takes over the composer area when the agent's
 * most recent output is an unanswered question or plan block. Renders the
 * plan-review surface or the question surface accordingly. Driven purely
 * off the event stream — no `sessionStatus` gate — so the bar appears as
 * soon as the events scope is hydrated, even if the server-side status
 * flip arrives a tick later. Disappears once the user (or any teammate)
 * sends a follow-up `message_sent` event.
 */
export function PendingInputBar({ sessionId, keyboardVisible = false }: PendingInputBarProps) {
  const scopeKey = eventScopeKey("session", sessionId);
  const eventIds = useScopedEventIds(scopeKey);
  const events = useScopedEvents(scopeKey);
  const pending = useMemo(() => findMostRecentPendingInput(eventIds, events), [eventIds, events]);
  const sessionStatus = useEntityField("sessions", sessionId, "sessionStatus");
  const latestPlan = useEntityStore((state) => {
    let latest: Artifact | null = null;
    for (const artifact of Object.values(state.artifacts)) {
      if (
        artifact.sessionId === sessionId &&
        artifact.type === "trace.visual-plan.v1" &&
        artifact.key === "primary" &&
        (!latest || artifact.createdAt > latest.createdAt)
      ) {
        latest = artifact;
      }
    }
    return latest;
  });
  const [artifactContent, setArtifactContent] = useState("");

  useEffect(() => {
    if (!latestPlan || sessionStatus !== "needs_input") {
      setArtifactContent("");
      return;
    }
    const controller = new AbortController();
    const htmlPath = visualPlanHtmlPath(latestPlan);
    if (!htmlPath) {
      setArtifactContent("");
      return;
    }
    const path = `${getActiveApiUrl()}/artifacts/${encodeURIComponent(latestPlan.id)}/files/${htmlPath
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;
    fetch(path, {
      headers: getAuthHeaders(),
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error("failed"))))
      .then(setArtifactContent)
      .catch(() => undefined);
    return () => controller.abort();
  }, [latestPlan, sessionStatus]);

  if (!pending && latestPlan && artifactContent && sessionStatus === "needs_input") {
    return (
      <PendingInputPlan
        sessionId={sessionId}
        artifactId={latestPlan.id}
        planContent={artifactContent}
        visualPlanHtml={artifactContent}
        keyboardVisible={keyboardVisible}
      />
    );
  }
  if (!pending) return null;

  if (pending.kind === "plan") {
    return (
      <PendingInputPlan
        sessionId={sessionId}
        planContent={pending.planContent}
        keyboardVisible={keyboardVisible}
      />
    );
  }

  return (
    <PendingInputQuestion
      sessionId={sessionId}
      questions={pending.questions}
      hasActivePlan={pending.hasActivePlan}
      keyboardVisible={keyboardVisible}
    />
  );
}
