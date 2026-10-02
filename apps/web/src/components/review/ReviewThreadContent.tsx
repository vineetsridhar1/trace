import { useMemo } from "react";
import { useEntityField } from "@trace/client-core";
import { Check } from "lucide-react";
import { cn } from "../../lib/utils";
import { anchorPresentation, deliveryPresentation } from "./review-states";
import { ReviewThreadBody } from "./ReviewThreadBody";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function ReviewThreadContent({ threadId }: { threadId: string }) {
  const authorName = useEntityField("reviewThreads", threadId, "author")?.name ?? "";
  const scope = useEntityField("reviewThreads", threadId, "scope");
  const rawAnchor = useEntityField("reviewThreads", threadId, "anchor");
  const deliveryStatus = useEntityField("reviewThreads", threadId, "deliveryStatus");
  const deliveryError = useEntityField("reviewThreads", threadId, "deliveryError");
  const comments = useEntityField("reviewThreads", threadId, "comments");
  const anchor = rawAnchor ? anchorPresentation(rawAnchor) : null;
  const delivery = deliveryPresentation(deliveryStatus ?? "trace_only");
  const visible = useMemo(
    () => (comments ?? []).filter((comment) => !comment.deletedAt),
    [comments],
  );
  const [first, ...replies] = visible;

  return (
    <div className="flex gap-2.5 p-3.5">
      <span className="size-6 shrink-0 rounded-full bg-[var(--th-review-accent-edge)] text-center text-[10px] font-semibold leading-6 text-[var(--th-review-accent-tint)]">
        {initials(authorName)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
          <span className="text-[var(--th-review-text)]">{authorName}</span>
          {anchor ? (
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-[10px] bg-white/[0.04] px-[7px] py-px text-[10.5px]",
                anchor.text,
              )}
            >
              <span className={cn("size-[5px] rounded-full", anchor.dot)} />
              {anchor.label}
            </span>
          ) : (
            <span className="text-[10.5px] text-muted-foreground">{scope?.replace("_", " ")}</span>
          )}
          <span
            className={cn(
              "ml-auto flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px]",
              deliveryStatus === "selected" || deliveryStatus === "delivered"
                ? "bg-[var(--th-accent)]/[0.14]"
                : "bg-white/[0.04]",
              delivery.text,
            )}
          >
            {deliveryStatus === "delivered" ? <Check size={10} /> : null}
            {delivery.label}
          </span>
        </div>
        {first ? <ReviewThreadBody body={first.body} /> : null}
        {replies.length > 0 ? (
          <div className="mt-1 flex flex-col gap-2 border-l border-[var(--th-edge-strong)] pl-3">
            {replies.map((comment) => (
              <div key={comment.id}>
                <span className="mr-2 text-[10.5px] font-medium text-muted-foreground">
                  {comment.author.name}
                </span>
                <ReviewThreadBody body={comment.body} />
              </div>
            ))}
          </div>
        ) : null}
        {deliveryError ? (
          <p className="text-[11px] text-[var(--th-review-danger-light)]">{deliveryError}</p>
        ) : null}
      </div>
    </div>
  );
}
