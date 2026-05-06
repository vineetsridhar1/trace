import { useCallback, useMemo, useState } from "react";
import { Map, Send } from "lucide-react";
import { SEND_SESSION_MESSAGE_MUTATION } from "@trace/client-core";
import { client } from "../../../lib/urql";
import { Markdown } from "../../ui/Markdown";
import { Button } from "../../ui/button";
import type { MarkdownSteerAnnotation, MarkdownSteerBlock } from "../../ui/markdownSteering";
import { formatTime } from "./utils";

interface PlanReviewCardProps {
  sessionId: string;
  planContent: string;
  planFilePath: string;
  timestamp: string;
}

function getAnnotationIndex(annotation: MarkdownSteerAnnotation): number {
  const [index] = annotation.id.split("-");
  const parsed = Number(index);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildAnnotationPrompt(annotations: MarkdownSteerAnnotation[]): string {
  const annotationText = annotations
    .map(
      (annotation, index) =>
        `Annotation ${index + 1}\n\nSelected plan block:\n${annotation.markdown}\n\nFeedback:\n${annotation.feedback}`,
    )
    .join("\n\n---\n\n");

  return `Please revise the plan using these inline annotations. Apply them together, keep the rest of the plan coherent, and do not start implementation yet.\n\n${annotationText}`;
}

export function PlanReviewCard({
  sessionId,
  planContent,
  planFilePath,
  timestamp,
}: PlanReviewCardProps) {
  const [annotations, setAnnotations] = useState<Record<string, MarkdownSteerAnnotation>>({});
  const [sendingAnnotations, setSendingAnnotations] = useState(false);

  const annotationList = useMemo(
    () => Object.values(annotations).sort((a, b) => getAnnotationIndex(a) - getAnnotationIndex(b)),
    [annotations],
  );

  const handleSaveAnnotation = useCallback((block: MarkdownSteerBlock, feedback: string) => {
    setAnnotations((current) => ({
      ...current,
      [block.id]: {
        ...block,
        feedback,
      },
    }));
  }, []);

  const handleRemoveAnnotation = useCallback((blockId: string) => {
    setAnnotations((current) => {
      const next = { ...current };
      delete next[blockId];
      return next;
    });
  }, []);

  const handleSendAnnotations = useCallback(async () => {
    if (annotationList.length === 0 || sendingAnnotations) return;

    setSendingAnnotations(true);
    try {
      await client
        .mutation(SEND_SESSION_MESSAGE_MUTATION, {
          sessionId,
          text: buildAnnotationPrompt(annotationList),
          interactionMode: "plan",
        })
        .toPromise();
      setAnnotations({});
    } finally {
      setSendingAnnotations(false);
    }
  }, [annotationList, sendingAnnotations, sessionId]);

  const annotationCount = annotationList.length;
  const annotationLabel =
    annotationCount === 1 ? "1 inline annotation" : `${annotationCount} inline annotations`;

  return (
    <div className="accent-dashed-container px-4 py-3">
      <div className="mb-3 flex items-center gap-2">
        <Map size={16} className="text-accent" />
        <span className="text-sm font-medium text-accent">Plan Review</span>
        {planFilePath && (
          <span className="text-xs text-muted-foreground font-mono truncate">
            {planFilePath.split("/").pop()}
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{formatTime(timestamp)}</span>
      </div>

      <Markdown
        steerableBlocks
        annotations={annotations}
        onSaveAnnotation={handleSaveAnnotation}
        onRemoveAnnotation={handleRemoveAnnotation}
      >
        {planContent}
      </Markdown>

      {annotationCount > 0 && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-accent/20 bg-accent/5 px-3 py-2">
          <span className="text-xs text-muted-foreground">{annotationLabel}</span>
          <Button
            type="button"
            size="xs"
            onClick={() => void handleSendAnnotations()}
            disabled={sendingAnnotations}
            className="h-6 rounded-md bg-accent px-2 text-[11px] text-accent-foreground hover:bg-accent/90"
          >
            <Send size={12} />
            Send annotations
          </Button>
        </div>
      )}
    </div>
  );
}
