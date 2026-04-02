import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Monitor } from "lucide-react";

interface InboxBridgeAccessBodyProps {
  payload: Record<string, unknown>;
  onDismiss: () => void;
}

export function InboxBridgeAccessBody({ payload, onDismiss }: InboxBridgeAccessBodyProps) {
  const code = (payload.code as string) ?? "??";
  const requesterName = (payload.requesterName as string) ?? "Someone";
  const action = (payload.action as string) ?? "access";
  const promptPreview = payload.promptPreview as string | undefined;
  const runtimeLabel = (payload.runtimeLabel as string) ?? "bridge";
  const expiresAt = payload.expiresAt as string | undefined;

  const [timeLeft, setTimeLeft] = useState("");
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!expiresAt) return;
    const update = () => {
      const remaining = new Date(expiresAt).getTime() - Date.now();
      if (remaining <= 0) {
        setExpired(true);
        setTimeLeft("Expired");
      } else {
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        setTimeLeft(`${minutes}:${seconds.toString().padStart(2, "0")}`);
      }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return (
    <div className="px-4 pb-3 space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Monitor size={12} />
        <span>{runtimeLabel}</span>
        {action === "start_session" && <span>- New session</span>}
        {action === "send_message" && <span>- Message</span>}
      </div>

      {promptPreview && (
        <p className="text-xs text-muted-foreground italic truncate">
          &ldquo;{promptPreview}&rdquo;
        </p>
      )}

      {/* Prominent code display */}
      <div className="flex items-center justify-center gap-3">
        <div className="flex gap-2">
          {code.split("").map((digit, i) => (
            <div
              key={i}
              className="flex h-14 w-12 items-center justify-center rounded-lg border-2 border-border bg-surface-deep text-3xl font-mono font-bold text-foreground"
            >
              {digit}
            </div>
          ))}
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Share this code with <span className="font-medium text-foreground">{requesterName}</span>
      </p>

      <div className="flex items-center justify-between">
        <span className={`text-xs ${expired ? "text-destructive" : "text-muted-foreground"}`}>
          {timeLeft}
        </span>
        <Button variant="outline" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
