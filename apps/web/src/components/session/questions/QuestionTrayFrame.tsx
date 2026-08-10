import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function QuestionTrayFrame({
  label,
  meta,
  tone = "pending",
  compact = false,
  fill = false,
  children,
  footer,
  onExit,
}: {
  label: string;
  meta: string;
  tone?: "pending" | "error";
  compact?: boolean;
  fill?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  onExit?: () => void;
}) {
  return (
    <div
      className={cn(
        "shrink-0 bg-background",
        fill ? "h-full" : "px-4",
        !fill && (compact ? "pb-2" : "pb-8"),
      )}
    >
      <section
        aria-label="Questions from the agent"
        data-layout={fill ? "fill" : undefined}
        className={cn(
          "mx-auto max-h-[calc(100dvh-4rem)] w-[90%] overflow-y-auto rounded-2xl border bg-surface-mid shadow-sm",
          fill &&
            "flex h-full max-h-none w-full flex-col overflow-hidden rounded-none border-0 shadow-none",
          tone === "error" ? "border-destructive/55" : "border-border",
        )}
      >
        <header className="flex items-center gap-2 bg-surface-deep/45 px-3 py-2.5">
          <span
            aria-hidden="true"
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              tone === "error" ? "bg-destructive" : "bg-[var(--th-warn)]",
            )}
          />
          <span className={cn("text-xs font-semibold", tone === "error" && "text-destructive")}>
            {label}
          </span>
          {meta ? (
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">{meta}</span>
          ) : (
            <span className="ml-auto" />
          )}
          {onExit ? (
            <button
              type="button"
              aria-label="Exit to chat"
              title="Exit to chat (Esc)"
              onClick={onExit}
              className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
            >
              <X size={13} aria-hidden="true" />
            </button>
          ) : null}
        </header>
        <div
          className={cn(
            "border-t border-border px-3 py-3",
            fill && "min-h-0 flex-1 overflow-y-auto",
          )}
        >
          {children}
        </div>
        {footer ? <footer className="border-t border-border px-3 py-3">{footer}</footer> : null}
      </section>
    </div>
  );
}
