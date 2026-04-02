import { Markdown } from "../../ui/Markdown";
import { formatTime } from "./utils";

export function AssistantText({ text, timestamp }: { key?: React.Key; text: string; timestamp: string }) {
  return (
    <div className="activity-row">
      <Markdown>{text}</Markdown>
      <span className="mt-1 block text-[10px] text-muted-foreground">{formatTime(timestamp)}</span>
    </div>
  );
}
