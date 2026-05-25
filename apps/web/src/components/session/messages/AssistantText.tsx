import { useCallback, useState } from "react";
import { Check, Copy, GitFork } from "lucide-react";
import { toast } from "sonner";
import { Markdown } from "../../ui/Markdown";

export function AssistantText({
  text,
  eventId,
  onForkSession,
  canForkSession = false,
}: {
  key?: React.Key;
  text: string;
  eventId: string;
  onForkSession?: (eventId: string) => void;
  canForkSession?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Failed to copy message");
    }
  }, [text]);

  return (
    <div className="activity-row">
      <Markdown>{text}</Markdown>
      <div className="mt-2 flex items-center gap-3 text-muted-foreground">
        <button
          type="button"
          onClick={handleCopy}
          className="flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-surface-elevated hover:text-foreground"
          title={copied ? "Copied" : "Copy message"}
          aria-label={copied ? "Copied" : "Copy message"}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
        <button
          type="button"
          onClick={() => onForkSession?.(eventId)}
          disabled={!canForkSession || !onForkSession}
          className="flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-surface-elevated hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          title="Fork session"
          aria-label="Fork session"
        >
          <GitFork size={14} />
        </button>
      </div>
    </div>
  );
}
