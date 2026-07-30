import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Icon } from "./icons";

const SOURCE = "src/design/components/settings/modal.tsx";

/**
 * Dialog artboard frame: renders the underlying settings screen dimmed and
 * inert behind a centered modal, so every dialog is seen in its real context.
 */
export function ModalScreen({
  traceId,
  background,
  children,
}: {
  traceId: string;
  background: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      data-trace-id={traceId}
      data-trace-source={SOURCE}
      className="relative h-full overflow-hidden bg-design-background"
    >
      <div aria-hidden="true" className="pointer-events-none h-full select-none">
        {background}
      </div>
      <div
        data-trace-id={`${traceId}-backdrop`}
        data-trace-source={SOURCE}
        className="absolute inset-0 z-30 flex items-center justify-center bg-design-background/70 p-6 backdrop-blur-[2px]"
      >
        {children}
      </div>
    </div>
  );
}

export function ModalDialog({
  traceId,
  title,
  description,
  footerLeft,
  footerRight,
  width = 640,
  children,
}: {
  traceId: string;
  title: string;
  description: ReactNode;
  footerLeft?: ReactNode;
  footerRight: ReactNode;
  width?: number;
  children: ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-trace-id={traceId}
      data-trace-source={SOURCE}
      style={{ maxWidth: width }}
      className="flex max-h-full w-full flex-col rounded-design-surface border border-design-border bg-design-surface shadow-design-surface"
    >
      <div
        data-trace-id={`${traceId}-header`}
        data-trace-source={SOURCE}
        className="flex items-start justify-between gap-4 border-b border-design-border px-6 py-4"
      >
        <div className="min-w-0">
          <h2 className="font-design-display text-[15px] font-semibold tracking-[-0.01em] text-design-foreground">
            {title}
          </h2>
          <p className="mt-0.5 text-[13px] leading-5 text-design-muted">{description}</p>
        </div>
        <button
          type="button"
          aria-label={`Close ${title}`}
          data-trace-id={`${traceId}-close`}
          data-trace-source={SOURCE}
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-design-control text-design-muted transition-colors duration-design ease-design hover:bg-design-background hover:text-design-foreground"
        >
          <Icon name="x" size={15} />
        </button>
      </div>
      <div
        data-trace-id={`${traceId}-body`}
        data-trace-source={SOURCE}
        className="min-h-0 flex-1 overflow-y-auto px-6 py-4"
      >
        {children}
      </div>
      <div
        data-trace-id={`${traceId}-footer`}
        data-trace-source={SOURCE}
        className="flex items-center justify-between gap-3 border-t border-design-border px-6 py-3.5"
      >
        <div className="flex min-w-0 items-center gap-2">{footerLeft}</div>
        <div className="flex shrink-0 items-center gap-2">{footerRight}</div>
      </div>
    </div>
  );
}

/* Micro section label inside dialogs — same voice as detail panels on screens. */
export function ModalSectionLabel({ traceId, children }: { traceId: string; children: ReactNode }) {
  return (
    <p
      data-trace-id={traceId}
      data-trace-source={SOURCE}
      className="text-xs font-semibold uppercase tracking-[0.08em] text-design-secondary"
    >
      {children}
    </p>
  );
}

/* Field label with optional required marker and hint below the control. */
export function ModalField({
  traceId,
  label,
  required = false,
  hint,
  className,
  children,
}: {
  traceId: string;
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div data-trace-id={traceId} data-trace-source={SOURCE} className={cn("min-w-0", className)}>
      <p className="mb-1.5 text-xs font-medium text-design-muted">
        {label}
        {required ? (
          <span className="ml-1.5 rounded-full border border-design-border px-1.5 py-px text-[10px] font-medium text-design-secondary">
            Required
          </span>
        ) : null}
      </p>
      {children}
      {hint ? <p className="mt-1.5 text-xs leading-4 text-design-muted">{hint}</p> : null}
    </div>
  );
}

/* Text input at dialog density. */
export function ModalInput({
  traceId,
  value,
  placeholder,
  mono = false,
  label,
  className,
}: {
  traceId: string;
  value?: string;
  placeholder?: string;
  mono?: boolean;
  label: string;
  className?: string;
}) {
  return (
    <input
      type="text"
      defaultValue={value}
      placeholder={placeholder}
      aria-label={label}
      data-trace-id={traceId}
      data-trace-source={SOURCE}
      className={cn(
        "h-9 w-full rounded-design-control border border-design-border bg-design-background px-3 text-design-foreground outline-none transition-colors duration-design ease-design placeholder:text-design-secondary focus:border-design-primary focus:ring-2 focus:ring-design-primary/25",
        mono ? "font-design-mono text-xs" : "text-[13px]",
        className,
      )}
    />
  );
}
