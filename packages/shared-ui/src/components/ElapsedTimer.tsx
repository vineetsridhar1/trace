import { useEffect, useRef, useState } from 'react';

export function ElapsedTimer({ startTime }: { startTime: string }) {
  const startRef = useRef(new Date(startTime).getTime());
  const [elapsed, setElapsed] = useState(() =>
    Math.floor((Date.now() - startRef.current) / 1000),
  );

  useEffect(() => {
    startRef.current = new Date(startTime).getTime();
    setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
  }, [startTime]);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const secs = Math.max(0, elapsed);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  const h = Math.floor(m / 60);
  const display =
    h > 0
      ? `${h}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;

  return (
    <span className="tabular-nums text-xs text-accent-light/70">{display}</span>
  );
}
