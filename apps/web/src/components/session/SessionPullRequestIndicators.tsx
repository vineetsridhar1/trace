import { useEffect } from "react";
import { Check, CircleHelp, Clock3, X } from "lucide-react";
import { useAuthStore, useEntityField } from "@trace/client-core";
import {
  subscribePullRequestStatus,
  usePullRequestStatusStore,
} from "../../stores/session-pull-request-status";

export function SessionPullRequestIndicators({
  sessionGroupId,
  showDetails = false,
}: {
  sessionGroupId: string;
  showDetails?: boolean;
}) {
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
  const hasReview = review === "approved" || review === "changes_requested";
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
  const checkColor =
    checks === "success"
      ? "text-green-400"
      : checks === "failure"
        ? "text-destructive"
        : checks === "pending"
          ? "text-amber-400"
          : "text-muted-foreground";
  const reviewColor = review === "approved" ? "bg-green-400" : "bg-destructive";
  if (showDetails) {
    return (
      <span className="flex flex-col gap-2">
        <span className="flex items-center gap-1.5">
          <CheckIcon size={12} aria-hidden="true" className={`shrink-0 ${checkColor}`} />
          <span>{checkLabel}</span>
        </span>
        {hasReview && (
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-flex size-3 shrink-0 items-center justify-center"
            >
              <span className={`size-2 rounded-full ${reviewColor}`} />
            </span>
            <span>{reviewLabel}</span>
          </span>
        )}
      </span>
    );
  }
  const label = hasReview ? `${checkLabel} · ${reviewLabel}` : checkLabel;
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      <span
        role="img"
        aria-label={label}
        title={label}
        className="relative inline-flex size-5 shrink-0"
      >
        <CheckIcon size={16} aria-hidden="true" className={checkColor} />
        {hasReview && (
          <span
            aria-hidden="true"
            className={`absolute bottom-0 right-0 size-2 rounded-full ring-1 ring-surface-deep ${reviewColor}`}
          />
        )}
      </span>
    </span>
  );
}
