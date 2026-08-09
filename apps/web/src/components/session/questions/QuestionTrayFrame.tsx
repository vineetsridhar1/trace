import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function QuestionTrayFrame({
  label,
  meta,
  tone = "pending",
  compact = false,
  children,
  footer,
  onExit,
}: {
  label: string;
  meta: string;
  tone?: "pending" | "error";
  compact?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  onExit?: () => void;
}) {
  return (
    <div
      className={cn(
        "shrink-0 bg-background px-4",
        compact
          ? "pb-2 max-md:bg-transparent"
          : "pb-8 max-md:fixed max-md:inset-0 max-md:z-30 max-md:flex max-md:flex-col max-md:px-0 max-md:pb-0",
      )}
    >
      <section
        aria-label="Questions from the agent"
        className={cn(
          "mx-auto max-h-[calc(100dvh-4rem)] w-[90%] overflow-y-auto rounded-2xl border bg-surface-mid shadow-sm",
          !compact &&
            "max-md:flex max-md:max-h-none max-md:w-full max-md:flex-1 max-md:flex-col max-md:overflow-hidden max-md:rounded-none max-md:border-0 max-md:bg-background max-md:shadow-none",
          tone === "error" ? "border-destructive/55" : "border-border",
        )}
      >
        <header
          className={cn(
            "flex items-center gap-2 bg-surface-deep/45 px-3 py-2.5",
            !compact &&
              "max-md:mx-3 max-md:mt-[max(0.5rem,env(safe-area-inset-top))] max-md:min-h-[54px] max-md:rounded-full max-md:border max-md:border-white/10 max-md:bg-surface-elevated/80 max-md:px-4 max-md:backdrop-blur-xl",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              tone === "error" ? "bg-destructive" : "bg-[var(--th-warn)]",
            )}
          />
          <span className={cn("text-xs font-semibold max-md:text-sm", tone === "error" && "text-destructive")}>
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
              className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground max-md:h-11 max-md:w-auto max-md:px-1 max-md:text-sm max-md:font-medium"
            >
              <X size={13} aria-hidden="true" className="max-md:hidden" />
              <span className="hidden max-md:inline">Cancel</span>
            </button>
          ) : null}
        </header>
        <div
          className={cn(
            "border-t border-border px-3 py-3",
            !compact &&
              "max-md:min-h-0 max-md:flex-1 max-md:overflow-y-auto max-md:border-0 max-md:px-4 max-md:pb-6 max-md:pt-7",
          )}
        >
          {children}
        </div>
        {footer ? (
          <footer
            className={cn(
              "border-t border-border px-3 py-3",
              !compact &&
                "max-md:border-0 max-md:bg-surface-elevated/85 max-md:px-4 max-md:pb-[max(1.25rem,env(safe-area-inset-bottom))] max-md:pt-3 max-md:backdrop-blur-xl",
            )}
          >
            {footer}
          </footer>
        ) : null}
      </section>
    </div>
  );
}
