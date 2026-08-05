import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function QuestionCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "structured-question relative overflow-hidden rounded-[14px] border border-foreground/30 bg-surface shadow-2xl",
        className,
      )}
    >
      <span className="absolute inset-y-0 left-0 w-[3px] bg-foreground/45" aria-hidden="true" />
      {children}
    </div>
  );
}

export function QuestionEyebrow({
  type,
  label = "Needs your input",
}: {
  type?: string;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--th-warn)]" aria-hidden="true" />
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground">
        {label}
      </span>
      {type ? (
        <span className="ml-auto rounded border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          {type}
        </span>
      ) : null}
    </div>
  );
}

export function QuestionChoice({
  label,
  detail,
  keyHint,
  selected,
  multi,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  detail?: string;
  keyHint?: string;
  selected: boolean;
  multi: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
        selected
          ? "border-foreground/35 bg-foreground/[0.08]"
          : "border-border bg-surface-deep/55 hover:border-foreground/30",
      )}
      {...props}
    >
      {keyHint ? (
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded border border-border font-mono text-[10px] text-muted-foreground">
          {keyHint}
        </span>
      ) : null}
      <span className="grid gap-0.5">
        <span className="text-[13px] font-medium leading-4 text-foreground">{label}</span>
        {detail ? (
          <span className="text-[11px] leading-4 text-muted-foreground">{detail}</span>
        ) : null}
      </span>
      <span
        className={cn(
          "ml-auto grid h-4 w-4 shrink-0 place-items-center border",
          multi ? "rounded-[3px]" : "rounded-full",
          selected ? "border-foreground bg-foreground" : "border-muted-foreground",
        )}
        aria-hidden="true"
      >
        {selected ? (
          multi ? (
            <Check size={11} strokeWidth={3} className="text-background" />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-background" />
          )
        ) : null}
      </span>
    </button>
  );
}

export function QuestionProgress({
  current,
  total,
  answered,
}: {
  current: number;
  total: number;
  answered: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex gap-1" aria-hidden="true">
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={cn(
              "h-1 w-6 rounded-full",
              index < answered
                ? "bg-foreground"
                : index === current
                  ? "bg-foreground/35"
                  : "bg-border",
            )}
          />
        ))}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        Question {current + 1} of {total}
      </span>
    </div>
  );
}
