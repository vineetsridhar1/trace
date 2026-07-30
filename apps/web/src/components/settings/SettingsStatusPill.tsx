import { cn } from "../../lib/utils";

const TONES = {
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  muted: "border-border bg-background/60 text-muted-foreground",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  danger: "border-red-500/30 bg-red-500/10 text-red-400",
} as const;

export function SettingsStatusPill({ tone, label }: { tone: keyof typeof TONES; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        TONES[tone],
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
