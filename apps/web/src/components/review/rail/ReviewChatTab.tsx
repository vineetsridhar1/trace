import type { ReviewInquiry } from "@trace/gql";
import { ReviewChatEntry } from "./ReviewChatEntry";

export function ReviewChatTab({
  inquiries,
  nextQueuedId,
  onOpenReference,
  onTurnIntoComment,
}: {
  inquiries: ReviewInquiry[];
  nextQueuedId: string | null;
  onOpenReference(filePath: string, startLine: number): void;
  onTurnIntoComment(inquiry: ReviewInquiry): void;
}) {
  if (inquiries.length === 0)
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-1.5 px-4 text-center">
        <span className="text-[13px] font-medium text-[#ededef]">Nothing asked yet</span>
        <span className="text-[11.5px] leading-[1.5] text-muted-foreground">
          Select lines in the diff and choose Ask session, or type a question below. Questions run
          one at a time.
        </span>
      </div>
    );
  return (
    <div className="native-scrollbar flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-4 py-3.5">
      {inquiries.map((inquiry, index) => (
        <div key={inquiry.id} className="flex flex-col gap-[18px]">
          {index > 0 ? <div className="h-px bg-[#1f1f23]" /> : null}
          <ReviewChatEntry
            inquiry={inquiry}
            isNext={inquiry.id === nextQueuedId}
            onOpenReference={onOpenReference}
            onTurnIntoComment={onTurnIntoComment}
          />
        </div>
      ))}
    </div>
  );
}
