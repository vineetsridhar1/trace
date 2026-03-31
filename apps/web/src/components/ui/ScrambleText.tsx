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
  /** When true, run the scramble animation on initial mount */
  animateOnMount?: boolean;
}

export function ScrambleText({ text: rawText, className, speed = 30, animateOnMount }: ScrambleTextProps) {
  const text = rawText ?? "";
  const [revealed, setRevealed] = useState(animateOnMount ? 0 : text.length);
  const [scrambled, setScrambled] = useState(animateOnMount ? scramble(text) : "");
  const prevTextRef = useRef<string | null>(animateOnMount ? "__initial__" : null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Skip animation on initial mount (unless animateOnMount is set)
    if (prevTextRef.current === null) {
      prevTextRef.current = text;
      return;
    }

    // Skip if text hasn't actually changed (but allow initial animation)
    if (prevTextRef.current === text && prevTextRef.current !== "__initial__") return;
    prevTextRef.current = text;

    // Clear any running animation
    if (intervalRef.current) clearInterval(intervalRef.current);

    let rev = 0;
    const step = Math.max(1, Math.ceil(text.length / 30));
    setRevealed(0);
    setScrambled(scramble(text));

    intervalRef.current = setInterval(() => {
      rev += step;
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
