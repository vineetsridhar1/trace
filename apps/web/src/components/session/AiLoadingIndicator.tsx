import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { TraceLoader } from "../ui/trace-loader";

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
        setElapsed((prev: number) => prev + 1);
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
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="flex items-center gap-1.5 pb-2"
    >
      <TraceLoader size={14} showLabel={false} className="text-white" />
      <span className="text-[11px] text-muted-foreground">
        {model} is working • {formatTime(elapsed)}
      </span>
    </motion.div>
  );
}
