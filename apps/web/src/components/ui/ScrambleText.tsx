import { useState, useEffect, useRef } from "react";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function scramble(str: string) {
  return str
    .split("")
    .map((ch) => (ch === " " ? " " : CHARS[Math.floor(Math.random() * CHARS.length)]))
    .join("");
}

interface ScrambleTextProps {
  text: string;
  className?: string;
  speed?: number;
}

export function ScrambleText({ text, className, speed = 20 }: ScrambleTextProps) {
  const [revealed, setRevealed] = useState(text.length);
  const [scrambled, setScrambled] = useState("");
  const prevTextRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Skip animation on initial mount
    if (prevTextRef.current === null) {
      prevTextRef.current = text;
      return;
    }

    // Skip if text hasn't actually changed
    if (prevTextRef.current === text) return;
    prevTextRef.current = text;

    // Clear any running animation
    if (intervalRef.current) clearInterval(intervalRef.current);

    let rev = 0;
    setRevealed(0);
    setScrambled(scramble(text));

    intervalRef.current = setInterval(() => {
      rev += 3;
      if (rev >= text.length) {
        setRevealed(text.length);
        setScrambled("");
        if (intervalRef.current) clearInterval(intervalRef.current);
        return;
      }
      setRevealed(rev);
      setScrambled(scramble(text.slice(rev)));
    }, speed);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [text, speed]);

  if (revealed >= text.length) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {text.slice(0, revealed)}
      <span className="text-muted-foreground">{scrambled}</span>
    </span>
  );
}
