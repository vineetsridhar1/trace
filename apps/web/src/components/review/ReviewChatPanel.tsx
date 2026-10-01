import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ReviewInquiry } from "@trace/gql";
import { Clock3, MessageCircle, X } from "lucide-react";
import { gql } from "@urql/core";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { mutateReview } from "./review-operations";

const CANCEL = gql`
  mutation CancelReviewInquiry($inquiryId: ID!) {
    cancelReviewInquiry(inquiryId: $inquiryId) {
      id
      state
    }
  }
`;

export function ReviewChatPanel({ inquiries }: { inquiries: ReviewInquiry[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: inquiries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120,
    overscan: 3,
  });
  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-l border-border bg-surface-deep">
      <div className="flex h-10 items-center gap-2 border-b border-border px-3 text-xs font-semibold">
        <MessageCircle size={13} /> Review Chat{" "}
        <span className="ml-auto text-[10px] font-normal text-muted-foreground">
          attached session
        </span>
      </div>
      <div ref={parentRef} className="native-scrollbar min-h-0 flex-1 overflow-y-auto">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((item) => {
            const inquiry = inquiries[item.index]!;
            return (
              <div
                key={inquiry.id}
                ref={virtualizer.measureElement}
                data-index={item.index}
                className="absolute left-0 top-0 w-full p-2"
                style={{ transform: `translateY(${item.start}px)` }}
              >
                <div className="rounded-lg border border-border bg-background p-2">
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock3 size={10} /> #{inquiry.position} · {inquiry.state.replace("_", " ")}
                    {inquiry.state === "queued" ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="ml-auto size-5"
                        onClick={() =>
                          void mutateReview(CANCEL, { inquiryId: inquiry.id }).catch((error) =>
                            toast.error(error instanceof Error ? error.message : "Cancel failed"),
                          )
                        }
                      >
                        <X size={10} />
                      </Button>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs">{inquiry.question}</p>
                  {inquiry.responseMessage?.text ? (
                    <p className="mt-2 whitespace-pre-wrap border-t border-border pt-2 text-xs leading-5 text-muted-foreground">
                      {inquiry.responseMessage.text}
                    </p>
                  ) : null}
                  {inquiry.error ? (
                    <p className="mt-1 text-[10px] text-destructive">{inquiry.error}</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
