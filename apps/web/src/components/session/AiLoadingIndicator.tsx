import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface AiLoadingIndicatorProps {
  model: string;
}

export function AiLoadingIndicator({ model }: AiLoadingIndicatorProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

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
