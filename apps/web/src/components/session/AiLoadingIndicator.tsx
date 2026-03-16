import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface AiLoadingIndicatorProps {
  model: string;
  /** ISO timestamp of the last user message — elapsed time is computed from this */
  startedAt?: string;
}

export function AiLoadingIndicator({ model, startedAt }: AiLoadingIndicatorProps) {
  const [elapsed, setElapsed] = useState(() => {
    if (!startedAt) return 0;
    return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  });

  useEffect(() => {
    // Re-sync whenever startedAt changes
    if (startedAt) {
      setElapsed(Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)));
    }
    const interval = setInterval(() => {
      if (startedAt) {
        setElapsed(Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)));
      } else {
        setElapsed((s) => s + 1);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  return (
    <div className="mt-2 flex h-7 items-center gap-1.5">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      <span className="text-[11px] text-muted-foreground">
        {model} is working • {formatTime(elapsed)}
      </span>
    </div>
  );
}
