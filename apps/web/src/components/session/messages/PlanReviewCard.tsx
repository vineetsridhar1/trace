import { useCallback } from "react";
import { Map } from "lucide-react";
import { SEND_SESSION_MESSAGE_MUTATION } from "@trace/client-core";
import { client } from "../../../lib/urql";
import { Markdown } from "../../ui/Markdown";
import type { MarkdownSteerBlock } from "../../ui/markdownSteering";
import { formatTime } from "./utils";

interface PlanReviewCardProps {
  sessionId: string;
  planContent: string;
  planFilePath: string;
  timestamp: string;
}

export function PlanReviewCard({
  sessionId,
  planContent,
  planFilePath,
  timestamp,
}: PlanReviewCardProps) {
  const handleSteerBlock = useCallback(
    async (block: MarkdownSteerBlock, feedback: string) => {
      await client
        .mutation(SEND_SESSION_MESSAGE_MUTATION, {
          sessionId,
          text: `Please revise only this part of the plan:\n\n${block.markdown}\n\nFeedback:\n${feedback}`,
          interactionMode: "plan",
        })
        .toPromise();
    },
    [sessionId],
  );

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

      <Markdown steerableBlocks onSteerBlock={handleSteerBlock}>
        {planContent}
      </Markdown>
    </div>
  );
}
