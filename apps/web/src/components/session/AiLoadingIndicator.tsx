import { useEffect, useState } from "react";
import Lottie from "lottie-react";

interface AiLoadingIndicatorProps {
  model: string;
  animationData: Record<string, unknown> | null;
}

export function AiLoadingIndicator({ model, animationData }: AiLoadingIndicatorProps) {
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
    <div className="mb-2 flex items-center justify-center gap-2">
      {animationData ? (
        <Lottie animationData={animationData} loop className="h-6 w-6" />
      ) : null}
      <span className="text-xs text-muted-foreground">
        {model} is working • {formatTime(elapsed)}
      </span>
    </div>
  );
}
