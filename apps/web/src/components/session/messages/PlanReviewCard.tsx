import { Map } from "lucide-react";
import { Markdown } from "../../ui/Markdown";
import { formatTime } from "./utils";

interface PlanReviewCardProps {
  planContent: string;
  planFilePath: string;
  timestamp: string;
}

export function PlanReviewCard({ planContent, planFilePath, timestamp }: PlanReviewCardProps) {
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

      <Markdown>{planContent}</Markdown>
    </div>
  );
}
