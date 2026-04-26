import { useEffect, useState } from "react";

export function useNowTicker(enabled: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, intervalMs);
    return () => clearInterval(interval);
  }, [enabled, intervalMs]);

  return now;
}
