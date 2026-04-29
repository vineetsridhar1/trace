import { AlertTriangle, CheckCircle, Info, Square } from "lucide-react";
import type { SessionStatusRowTone } from "@trace/client-core";
import { Markdown } from "../../ui/Markdown";
import { formatTime } from "./utils";

interface CompletionRowProps {
  timestamp: string;
  result?: string;
  isUserStop?: boolean;
  title?: string;
  tone?: SessionStatusRowTone;
}

export function CompletionRow({
  timestamp,
  result,
  isUserStop,
  title,
  tone = "success",
}: CompletionRowProps) {
  if (isUserStop) {
    return (
      <div className="flex items-center gap-1.5 py-0.5 px-1 opacity-45">
        <Square className="text-destructive" size={8} />
        <span className="text-[11px] text-muted-foreground">{title ?? "Stopped by user"}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{formatTime(timestamp)}</span>
      </div>
    );
  }

  const Icon = tone === "error" ? AlertTriangle : tone === "info" ? Info : CheckCircle;
  const iconClass = tone === "error" ? "text-destructive" : "text-muted-foreground";

  return (
    <div className="activity-row">
      <div className="flex items-center gap-2">
        <Icon size={12} className={iconClass} />
        <span className="text-xs font-semibold text-foreground">{title ?? "Run ended"}</span>
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
