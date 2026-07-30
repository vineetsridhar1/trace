import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Icon, type IconName } from "./icons";

const SOURCE = "src/design/components/settings/bits.tsx";

/* Status pill: dot + label so state is never color alone. */
const PILL_TONES = {
  success: "text-design-success border-design-success/30 bg-design-success/10",
  muted: "text-design-muted border-design-border bg-design-background/60",
  warning: "text-design-warning border-design-warning/30 bg-design-warning/10",
  danger: "text-design-danger border-design-danger/30 bg-design-danger/10",
} as const;

export function StatusPill({
  tone,
  label,
  traceId,
}: {
  tone: keyof typeof PILL_TONES;
  label: string;
  traceId: string;
}) {
  return (
    <span
      data-trace-id={traceId}
      data-trace-source={SOURCE}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        PILL_TONES[tone],
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

/* Desktop-density button built on the token vocabulary. */
const BUTTON_VARIANTS = {
  primary:
    "bg-design-primary text-design-primary-foreground hover:opacity-90 border border-transparent",
  outline:
    "border border-design-border bg-transparent text-design-foreground hover:bg-design-surface",
  ghost: "border border-transparent text-design-muted hover:text-design-foreground hover:bg-design-surface",
  danger:
    "border border-design-danger/40 bg-transparent text-design-danger hover:bg-design-danger/10",
} as const;

type ControlButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: "sm" | "md" | "icon";
  icon?: IconName;
  traceId: string;
};

export function ControlButton({
  variant = "outline",
  size = "md",
  icon,
  traceId,
  className,
  children,
  ...props
}: ControlButtonProps) {
  return (
    <button
      type="button"
      data-trace-id={traceId}
      data-trace-source={SOURCE}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-design-control text-[13px] font-medium transition-colors duration-design ease-design focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-design-primary disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" && "h-8 px-2.5",
        size === "md" && "h-9 px-3.5",
        size === "icon" && "h-8 w-8",
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {icon ? <Icon name={icon} size={size === "sm" || size === "icon" ? 14 : 15} /> : null}
      {children}
    </button>
  );
}

/* Flat content panel; hierarchy comes from spacing, not stacked shadows. */
export function Panel({
  traceId,
  className,
  children,
}: {
  traceId: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-trace-id={traceId}
      data-trace-source={SOURCE}
      className={cn("rounded-design-surface border border-design-border bg-design-surface", className)}
    >
      {children}
    </div>
  );
}

/* Toggle switch with label + description; replaces the app's Yes/No dropdowns. */
export function ToggleRow({
  traceId,
  label,
  description,
  defaultOn = false,
}: {
  traceId: string;
  label: string;
  description: string;
  defaultOn?: boolean;
}) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div
      data-trace-id={traceId}
      data-trace-source={SOURCE}
      className="flex items-start justify-between gap-6 py-4"
    >
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-design-foreground">{label}</p>
        <p className="mt-0.5 text-[13px] leading-5 text-design-muted">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        data-trace-id={`${traceId}-switch`}
        data-trace-source={SOURCE}
        onClick={() => setOn((v) => !v)}
        className={cn(
          "relative mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-design ease-design focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-design-primary",
          on
            ? "border-design-primary bg-design-primary"
            : "border-design-border bg-design-background",
        )}
      >
        <span
          className={cn(
            "absolute h-[18px] w-[18px] rounded-full transition-all duration-design ease-design",
            on ? "left-[22px] bg-design-primary-foreground" : "left-[3px] bg-design-muted",
          )}
        />
      </button>
    </div>
  );
}

/* Prototype select: real open/close state with a local menu. */
export function SelectMenu({
  traceId,
  label,
  options,
  initial,
  disabled = false,
  hint,
  className,
}: {
  traceId: string;
  label: string;
  options: string[];
  initial: string;
  disabled?: boolean;
  hint?: string;
  className?: string;
}) {
  const [value, setValue] = useState(initial);
  const [open, setOpen] = useState(false);
  return (
    <div data-trace-id={traceId} data-trace-source={SOURCE} className={cn("min-w-0", className)}>
      <p className="mb-1.5 text-xs font-medium text-design-muted">{label}</p>
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          data-trace-id={`${traceId}-trigger`}
          data-trace-source={SOURCE}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-design-control border border-design-border bg-design-background px-3 text-left text-[13px] text-design-foreground transition-colors duration-design ease-design hover:border-design-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-design-primary disabled:cursor-not-allowed disabled:opacity-45",
          )}
        >
          <span className="truncate">{value}</span>
          <Icon name="chevronDown" size={14} className="shrink-0 text-design-muted" />
        </button>
        {open ? (
          <ul
            role="listbox"
            data-trace-id={`${traceId}-menu`}
            data-trace-source={SOURCE}
            className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-design-control border border-design-border bg-design-surface py-1 shadow-design-surface"
          >
            {options.map((option) => (
              <li key={option}>
                <button
                  type="button"
                  role="option"
                  aria-selected={option === value}
                  onClick={() => {
                    setValue(option);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] transition-colors",
                    option === value
                      ? "text-design-foreground"
                      : "text-design-muted hover:bg-design-background/60 hover:text-design-foreground",
                  )}
                >
                  {option}
                  {option === value ? <Icon name="check" size={13} /> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {hint ? <p className="mt-1.5 text-xs leading-4 text-design-muted">{hint}</p> : null}
    </div>
  );
}

/* Monochrome initials avatar — calm, no per-user hues. */
export function Avatar({
  name,
  traceId,
  size = "md",
}: {
  name: string;
  traceId: string;
  size?: "sm" | "md";
}) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      data-trace-id={traceId}
      data-trace-source={SOURCE}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border border-design-border bg-design-background font-medium text-design-muted",
        size === "md" ? "h-8 w-8 text-[11px]" : "h-6 w-6 text-[10px]",
      )}
    >
      {initials}
    </span>
  );
}

export function EmptyState({
  traceId,
  icon,
  title,
  description,
  children,
}: {
  traceId: string;
  icon: IconName;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div
      data-trace-id={traceId}
      data-trace-source={SOURCE}
      className="flex flex-col items-center rounded-design-surface border border-dashed border-design-border px-8 py-12 text-center"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-design-border bg-design-surface text-design-muted">
        <Icon name={icon} size={18} />
      </span>
      <p className="mt-4 text-sm font-semibold text-design-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-[13px] leading-5 text-design-muted">{description}</p>
      {children ? <div className="mt-5 flex items-center gap-2">{children}</div> : null}
    </div>
  );
}
