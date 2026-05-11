import { AlertCircle, CheckCircle } from "lucide-react";
import { Markdown } from "../../ui/Markdown";
import { formatTime } from "./utils";

interface CompletionRowProps {
  timestamp: string;
  result?: string;
  error?: string;
}

export function CompletionRow({ timestamp, result, error }: CompletionRowProps) {
  if (error !== undefined) {
    return (
      <div className="activity-row">
        <div className="flex items-center gap-2">
          <AlertCircle size={12} className="text-destructive" />
          <span className="text-xs font-semibold text-foreground">Session error</span>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {formatTime(timestamp)}
          </span>
        </div>
        {error && (
          <div className="mt-1 ml-5 whitespace-pre-wrap text-xs text-muted-foreground">
            {error}
          </div>
        )}
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
