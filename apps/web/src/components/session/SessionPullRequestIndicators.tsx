import { useEffect } from "react";
import { Check, CircleHelp, Clock3, UserRound, X } from "lucide-react";
import { useAuthStore, useEntityField } from "@trace/client-core";
import {
  subscribePullRequestStatus,
  usePullRequestStatusStore,
} from "../../stores/session-pull-request-status";

export function SessionPullRequestIndicators({ sessionGroupId }: { sessionGroupId: string }) {
  const prUrl = useEntityField("sessionGroups", sessionGroupId, "prUrl");
  const userId = useAuthStore((state) => state.user?.id);
  const key = JSON.stringify([userId, sessionGroupId, prUrl]);
  const status = usePullRequestStatusStore((state) => state.statuses[key]);
  useEffect(() => {
    if (prUrl && userId) return subscribePullRequestStatus(sessionGroupId, prUrl, userId);
  }, [sessionGroupId, prUrl, userId]);
  if (!prUrl) return null;

  const review = status?.review ?? "unknown";
  const checks = status?.checks ?? "unknown";
  const reviewLabel = {
    approved: "Review approved",
    changes_requested: "Review: changes requested",
    pending: "Awaiting review",
    unknown: "Review status unavailable",
  }[review];
  const checkLabel = {
    success: "CI passing",
    failure: "CI failing",
    pending: "CI pending",
    unknown: "CI status unavailable or no checks",
  }[checks];
  const CheckIcon =
    checks === "success"
      ? Check
      : checks === "failure"
        ? X
        : checks === "pending"
          ? Clock3
          : CircleHelp;
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      <span role="img" aria-label={reviewLabel} title={reviewLabel}>
        <UserRound
          size={13}
          aria-hidden="true"
          className={
            review === "approved"
              ? "text-green-400"
              : review === "changes_requested"
                ? "text-destructive"
                : "text-muted-foreground"
          }
        />
      </span>
      <span role="img" aria-label={checkLabel} title={checkLabel}>
        <CheckIcon
          size={13}
          aria-hidden="true"
          className={
            checks === "success"
              ? "text-green-400"
              : checks === "failure"
                ? "text-destructive"
                : "text-muted-foreground"
          }
        />
      </span>
    </span>
  );
}
