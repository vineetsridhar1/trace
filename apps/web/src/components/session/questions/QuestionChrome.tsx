import type { ButtonHTMLAttributes } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

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
        "flex min-h-10 w-full items-center gap-2.5 rounded-lg border px-3 py-1.5 text-left transition-colors max-md:min-h-[62px] max-md:gap-3 max-md:rounded-2xl max-md:px-4 max-md:py-2",
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
        <span className="text-[13px] font-medium leading-4 text-foreground max-md:text-[17px] max-md:leading-5">{label}</span>
        {detail ? (
          <span className="text-[11px] leading-4 text-muted-foreground max-md:mt-1 max-md:text-[13px]">{detail}</span>
        ) : null}
      </span>
      <span
        className={cn(
          "ml-auto grid h-4 w-4 shrink-0 place-items-center border max-md:h-6 max-md:w-6",
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
