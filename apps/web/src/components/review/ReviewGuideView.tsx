import { gql } from "@urql/core";
import type { ReviewGuide } from "@trace/gql";
import { BookOpen, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { mutateReview } from "./review-operations";
import { GuideChapter, type GuideChapterData } from "./guide/GuideChapter";

const GENERATE = gql`
  mutation GenerateReviewGuide($input: EnqueueReviewInquiryInput!) {
    enqueueReviewInquiry(input: $input) {
      id
      state
      position
    }
  }
`;
interface GuideContent {
  chapters?: GuideChapterData[];
  everythingElse?: string[];
}

export function ReviewGuideView({
  reviewId,
  snapshotId,
  guide,
  generating,
  onOpenReference,
}: {
  reviewId: string;
  snapshotId: string;
  guide?: ReviewGuide | null;
  generating: boolean;
  onOpenReference(reference: { filePath: string; startLine: number }): void;
}) {
  const content = (guide?.content ?? {}) as GuideContent;
  const generate = async () => {
    try {
      await mutateReview(GENERATE, {
        input: {
          reviewId,
          snapshotId,
          sourceKind: "guide_generation",
          question: "Generate an explanation-first Guide for this immutable review snapshot.",
          context: {},
        },
      });
      toast.success("Guide generation queued");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue Guide generation");
    }
  };
  if (!guide)
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <BookOpen className="mx-auto text-muted-foreground" size={30} />
          <h3 className="mt-3 text-sm font-semibold">Understand the change before reviewing it</h3>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Generate a semantic walkthrough using the attached coding session. It runs through the
            same FIFO Review Chat queue.
          </p>
          <Button className="mt-4" disabled={generating} onClick={() => void generate()}>
            <Sparkles size={13} />
            {generating ? "Guide queued…" : "Generate Guide"}
          </Button>
        </div>
      </div>
    );
  return (
    <div className="native-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-lg font-semibold">{guide.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{guide.intent}</p>
        {guide.status === "earlier" ? (
          <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-950/20 p-2 text-xs text-amber-200">
            This Guide belongs to an earlier immutable snapshot.
          </div>
        ) : null}
        <div className="mt-5 space-y-3">
          {(content.chapters ?? []).map((chapter) => (
            <GuideChapter key={chapter.id} chapter={chapter} onReference={onOpenReference} />
          ))}
          {content.everythingElse?.length ? (
            <div className="rounded-xl border border-border p-4">
              <h3 className="text-sm font-semibold">Everything else</h3>
              <div className="mt-2 flex flex-wrap gap-1">
                {content.everythingElse.map((path) => (
                  <button
                    key={path}
                    type="button"
                    onClick={() => onOpenReference({ filePath: path, startLine: 1 })}
                    className="rounded border border-border px-2 py-1 font-mono text-[10px]"
                  >
                    {path}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
