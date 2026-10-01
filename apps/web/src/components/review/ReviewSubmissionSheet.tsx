import { useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import type { ReviewThread } from "@trace/gql";
import { toast } from "sonner";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { mutateReview } from "./review-operations";

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

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  reviewId: string;
  snapshotId: string;
  threads: ReviewThread[];
}

export function ReviewSubmissionSheet({
  open,
  onOpenChange,
  reviewId,
  snapshotId,
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
  const [selected, setSelected] = useState<string[]>(() =>
    eligible.filter((thread) => thread.deliveryStatus === "selected").map((thread) => thread.id),
  );
  const [disposition, setDisposition] = useState<"comment" | "approve" | "request_changes">(
    "comment",
  );
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (!open) return;
    setSelected(
      eligible.filter((thread) => thread.deliveryStatus === "selected").map((thread) => thread.id),
    );
  }, [eligible, open]);
  const submit = async () => {
    setSubmitting(true);
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
      toast.success("Review delivered to GitHub");
      setIdempotencyKey(crypto.randomUUID());
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "GitHub delivery failed");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Send selected feedback to GitHub</DialogTitle>
          <DialogDescription>
            Only checked Trace threads will be delivered. Unchecked notes remain in Trace.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {eligible.map((thread) => (
            <label
              key={thread.id}
              className="flex cursor-pointer gap-2 rounded-md border border-border p-2 text-xs"
            >
              <input
                type="checkbox"
                checked={selected.includes(thread.id)}
                onChange={() =>
                  setSelected((ids) =>
                    ids.includes(thread.id)
                      ? ids.filter((id) => id !== thread.id)
                      : [...ids, thread.id],
                  )
                }
              />
              <span className="min-w-0">
                <span className="block truncate text-muted-foreground">
                  {thread.anchor?.filePath ?? "General comment"}
                </span>
                <span>{thread.comments[0]?.body}</span>
              </span>
            </label>
          ))}
        </div>
        <select
          value={disposition}
          onChange={(event) => setDisposition(event.target.value as typeof disposition)}
          className="rounded-md border border-border bg-background px-2 py-2 text-sm"
        >
          <option value="comment">Comment</option>
          <option value="approve">Approve</option>
          <option value="request_changes">Request changes</option>
        </select>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Optional review summary"
          className="h-20 resize-none rounded-md border border-border bg-background p-2 text-sm"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={submitting || (selected.length === 0 && !body.trim())}
            onClick={() => void submit()}
          >
            Send to GitHub
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
