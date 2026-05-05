import { Square, CheckCircle } from "lucide-react";
import { Markdown } from "../../ui/Markdown";
import { formatTime } from "./utils";

interface CompletionRowProps {
  timestamp: string;
  result?: string;
  isUserStop?: boolean;
}

export function CompletionRow({ timestamp, result, isUserStop }: CompletionRowProps) {
  if (isUserStop) {
    return (
      <div className="flex items-center gap-1.5 py-0.5 px-1 opacity-45">
        <Square className="text-destructive" size={8} />
        <span className="text-[11px] text-muted-foreground">Stopped by user</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{formatTime(timestamp)}</span>
      </div>
    );
  }

  return (
    <div className="activity-row">
      <div className="flex items-center gap-2">
        <CheckCircle size={12} className="text-muted-foreground" />
        <span className="text-xs font-semibold text-foreground">Run ended</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{formatTime(timestamp)}</span>
      </div>
      {result && (
        <div className="mt-1 ml-5">
          <Markdown>{result}</Markdown>
        </div>
      )}
    </div>
  );
}
