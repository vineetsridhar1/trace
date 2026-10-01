import { useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import type { ReviewDisposition, ReviewThread } from "@trace/gql";
import { Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { cn } from "../../lib/utils";
import { mutateReview } from "./review-operations";
import { anchorRangeLabel } from "./review-states";

const SUBMIT = gql`
  mutation SubmitReview($input: SubmitReviewInput!) {
    submitReviewToProvider(input: $input) {
      id
      status
      error
      providerReviewId
    }
  }
`;

const DISPOSITIONS: { id: ReviewDisposition; label: string }[] = [
  { id: "comment", label: "Comment" },
  { id: "approve", label: "Approve" },
  { id: "request_changes", label: "Request changes" },
];

type Delivery =
  | { phase: "idle" }
  | { phase: "posting" }
  | { phase: "done"; count: number }
  | { phase: "failed"; message: string };

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  reviewId: string;
  snapshotId: string;
  headSha: string;
  pullRequestNumber: number;
  pullRequestUrl: string;
  threads: ReviewThread[];
}

export function ReviewSubmissionSheet({
  open,
  onOpenChange,
  reviewId,
  snapshotId,
  headSha,
  pullRequestNumber,
  pullRequestUrl,
  threads,
}: Props) {
  const eligible = useMemo(
    () =>
      threads.filter(
        (thread) =>
          thread.originSnapshotId === snapshotId &&
          thread.deliveryStatus !== "delivered" &&
          thread.scope !== "guide_explanation",
      ),
    [snapshotId, threads],
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [disposition, setDisposition] = useState<ReviewDisposition>("comment");
  const [body, setBody] = useState("");
  const [delivery, setDelivery] = useState<Delivery>({ phase: "idle" });
  // One key spans every retry of the same intent so a failed post cannot duplicate the review.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (!open) return;
    setSelected(
      eligible.filter((thread) => thread.deliveryStatus === "selected").map((thread) => thread.id),
    );
    setDelivery({ phase: "idle" });
  }, [eligible, open]);

  const postable = (thread: ReviewThread) => thread.anchor?.status !== "outdated";
  const submit = async () => {
    setDelivery({ phase: "posting" });
    try {
      const result = await mutateReview<{
        submitReviewToProvider: { status: string; error?: string | null };
      }>(SUBMIT, {
        input: {
          reviewId,
          snapshotId,
          threadIds: selected,
          disposition,
          body: body.trim() || null,
          idempotencyKey,
        },
      });
      if (result.submitReviewToProvider.status === "failed")
        throw new Error(result.submitReviewToProvider.error ?? "GitHub rejected the review");
      setDelivery({ phase: "done", count: selected.length });
      setIdempotencyKey(crypto.randomUUID());
      toast.success("Review posted to GitHub");
    } catch (error) {
      setDelivery({
        phase: "failed",
        message: error instanceof Error ? error.message : "GitHub delivery failed",
      });
    }
  };

  const posting = delivery.phase === "posting";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] max-w-[600px] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="gap-1 border-b border-[#262626] px-5 pb-3.5 pt-[18px]">
          <DialogTitle className="text-[15px] font-semibold text-[#ededef]">
            Send review to GitHub
          </DialogTitle>
          <p className="m-0 text-xs text-muted-foreground">
            PR #{pullRequestNumber} &middot; head {headSha.slice(0, 7)}
          </p>
        </DialogHeader>

        <div className="native-scrollbar flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-5 py-3.5">
          <div className="flex items-center justify-between px-0.5 pb-1 text-[10.5px] font-semibold tracking-[0.07em] text-muted-foreground">
            THREADS
            <button
              type="button"
              onClick={() => setSelected(eligible.filter(postable).map((thread) => thread.id))}
              className="text-[11px] font-medium tracking-normal text-[#93c5fd] hover:underline"
            >
              Select all current
            </button>
          </div>
          {eligible.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No undelivered threads on this snapshot.
            </p>
          ) : null}
          {eligible.map((thread) => {
            const checked = selected.includes(thread.id);
            const outdated = !postable(thread);
            return (
              <button
                key={thread.id}
                type="button"
                disabled={outdated}
                onClick={() =>
                  setSelected((ids) =>
                    ids.includes(thread.id)
                      ? ids.filter((id) => id !== thread.id)
                      : [...ids, thread.id],
                  )
                }
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left",
                  outdated
                    ? "border border-dashed border-[#fbbf24]/35"
                    : checked
                      ? "border border-[#2e2e33] bg-[#1c1c1f]"
                      : "border border-[#262626]",
                )}
              >
                <span
                  className={cn(
                    "flex size-3.5 shrink-0 items-center justify-center rounded",
                    checked ? "bg-[#3b82f6] text-white" : "border border-[#52525b]",
                    outdated && "opacity-50",
                  )}
                >
                  {checked ? <Check size={9} /> : null}
                </span>
                <span
                  className={cn(
                    "w-[118px] shrink-0 truncate font-mono text-[11px] font-medium",
                    outdated ? "text-[#fbbf24]" : "text-muted-foreground",
                  )}
                >
                  {thread.anchor
                    ? `${thread.anchor.filePath.split("/").at(-1)} ${anchorRangeLabel(thread.anchor)}`
                    : "General"}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[12.5px]",
                    checked ? "text-[#d4d4d8]" : "text-[#a1a1aa]",
                  )}
                >
                  {outdated
                    ? "Outdated anchor — re-anchor to include"
                    : (thread.comments.find((comment) => !comment.deletedAt)?.body ?? "")}
                </span>
                {!checked && !outdated ? (
                  <span className="shrink-0 text-[11px] font-medium text-[#71717a]">
                    stays private
                  </span>
                ) : null}
              </button>
            );
          })}

          <div className="mt-2.5 flex flex-col gap-1.5">
            <span className="px-0.5 text-[10.5px] font-semibold tracking-[0.07em] text-muted-foreground">
              DISPOSITION
            </span>
            <div className="grid grid-cols-3 gap-1.5 text-xs font-medium">
              {DISPOSITIONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setDisposition(item.id)}
                  aria-pressed={disposition === item.id}
                  className={cn(
                    "rounded-lg px-3 py-2.5",
                    disposition === item.id
                      ? "border border-[#3b82f6] bg-[#3b82f6]/10 text-[#ededef]"
                      : "border border-[#262626] text-[#a1a1aa] hover:text-foreground",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Optional summary…"
            className="mt-1.5 h-[58px] resize-none rounded-lg border border-[#262626] bg-[#111] px-3 py-2.5 text-[12.5px] outline-none placeholder:text-[#5c5c66] focus:border-[#3b82f6]"
          />

          {delivery.phase === "posting" ? (
            <div className="mt-2 flex flex-col gap-2 rounded-[10px] border border-[#2e2e33] bg-[#171717] p-3">
              <span className="text-xs font-medium text-[#ededef]">Posting to GitHub…</span>
              <div className="h-1 overflow-hidden rounded bg-[#262626]">
                <div className="h-full w-1/2 animate-pulse rounded bg-[#3b82f6]" />
              </div>
              <span className="text-[11px] text-muted-foreground">
                {selected.length} thread{selected.length === 1 ? "" : "s"}
              </span>
            </div>
          ) : null}
          {delivery.phase === "done" ? (
            <div className="mt-2 flex flex-col gap-2 rounded-[10px] border border-[#34d399]/30 bg-[#171717] p-3">
              <span className="flex items-center gap-1.5 text-xs font-medium text-[#6ee7b7]">
                <Check size={12} /> Review posted
              </span>
              <span className="text-[11px] leading-[1.45] text-muted-foreground">
                {delivery.count} thread{delivery.count === 1 ? "" : "s"} delivered &middot;{" "}
                <a
                  href={pullRequestUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[#93c5fd]"
                >
                  View on GitHub <ExternalLink size={9} />
                </a>
              </span>
            </div>
          ) : null}
          {delivery.phase === "failed" ? (
            <div className="mt-2 flex flex-col gap-2 rounded-[10px] border border-[#f87171]/35 bg-[#171717] p-3">
              <span className="text-xs font-medium text-[#fca5a5]">Delivery failed</span>
              <span className="text-[11px] leading-[1.45] text-muted-foreground">
                {delivery.message} Retrying won&rsquo;t duplicate the review.
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2.5 border-t border-[#262626] bg-[#141414] px-5 py-3">
          <span className="flex-1 text-xs text-muted-foreground">
            {selected.length} thread{selected.length === 1 ? "" : "s"} post &middot;{" "}
            {eligible.length - selected.length} stay
            {eligible.length - selected.length === 1 ? "s" : ""} in Trace
          </span>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-8 items-center rounded-[7px] border border-[#262626] px-3 text-[12.5px] font-medium text-[#d4d4d8] hover:bg-white/5"
          >
            {delivery.phase === "done" ? "Close" : "Cancel"}
          </button>
          {delivery.phase === "done" ? null : (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={posting || (selected.length === 0 && !body.trim())}
              className="flex h-8 items-center rounded-[7px] bg-gradient-to-b from-[#4d8ff8] to-[#2f6fd8] px-3.5 text-[12.5px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_1px_3px_rgba(0,0,0,.4)] disabled:opacity-40"
            >
              {delivery.phase === "failed"
                ? "Retry"
                : posting
                  ? "Posting…"
                  : `Post ${DISPOSITIONS.find((item) => item.id === disposition)!.label.toLowerCase()} review`}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
