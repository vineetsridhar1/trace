import type { HTMLAttributes, ReactNode } from "react";
import "../../../../design-system/tokens.css";
import { cn } from "../../lib/cn";

/* Shared spec-sheet chrome: cards, captions, token chips, and do/don't frames. */

export function SpecHeader({
  title,
  description,
  ...props
}: HTMLAttributes<HTMLElement> & { title: string; description: string }) {
  return (
    <header {...props}>
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-design-primary">
        Component spec
      </p>
      <h1 className="mt-2 font-design-display text-2xl font-semibold tracking-tight text-design-foreground">
        {title}
      </h1>
      <p className="mt-1.5 max-w-2xl text-sm leading-6 text-design-muted">{description}</p>
    </header>
  );
}

export function SpecCard({
  title,
  caption,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & { title?: string; caption?: string }) {
  return (
    <section
      className={cn("rounded-[10px] border border-design-border p-5", className)}
      {...props}
    >
      {title ? (
        <h2 className="text-[13px] font-semibold text-design-foreground">{title}</h2>
      ) : null}
      {caption ? (
        <p className="mt-1 text-xs leading-5 text-design-muted">{caption}</p>
      ) : null}
      {title || caption ? <div className="mt-4">{children}</div> : children}
    </section>
  );
}

export function TokenChip({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-[4px] border border-design-border bg-design-surface px-1.5 py-0.5 font-design-mono text-[11px] text-design-muted">
      {children}
    </code>
  );
}

export function StateCaption({ label, note }: { label: string; note?: string }) {
  return (
    <div className="mt-3">
      <p className="font-design-mono text-[11px] uppercase tracking-[0.08em] text-design-foreground">
        {label}
      </p>
      {note ? <p className="mt-0.5 text-[11px] leading-4 text-design-muted">{note}</p> : null}
    </div>
  );
}

/** Horizontal callout used in the anatomy sheet: line + label, pointing left or right. */
export function AnatomyCallout({
  label,
  detail,
  align = "left",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { label: string; detail?: string; align?: "left" | "right" }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2",
        align === "right" && "flex-row-reverse text-right",
        className,
      )}
      {...props}
    >
      <span className="mt-[7px] h-px w-8 shrink-0 bg-[var(--surface-hover)]" />
      <span
        className={cn(
          "mt-[3px] size-[7px] shrink-0 rounded-full border border-design-primary bg-design-background",
          align === "left" ? "-ml-[26px] mr-4" : "-mr-[26px] ml-4",
        )}
      />
      <div className="min-w-0">
        <p className="text-xs font-medium text-design-foreground">{label}</p>
        {detail ? (
          <p className="mt-0.5 font-design-mono text-[10.5px] leading-4 text-design-muted">
            {detail}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function VerdictBadge({ kind }: { kind: "do" | "dont" }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold uppercase tracking-[0.06em]",
        kind === "do"
          ? "bg-[rgba(34,197,94,0.14)] text-design-success"
          : "bg-[rgba(239,68,68,0.14)] text-design-danger",
      )}
    >
      {kind === "do" ? "Do" : "Don’t"}
    </span>
  );
}
