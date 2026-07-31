import type { HTMLAttributes, ReactNode } from "react";
import "../../../../design-system/tokens.css";
import { cn } from "../../lib/cn";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "./icons";

/*
 * Presentational spec mocks for the Trace Select component.
 *
 * Values come from the tracev2 package (design-system/tokens.css + the Select
 * recipe in components.manifest.json):
 *   trigger  h-32/28px, px-12/10px, radius --radius-md (6px), bg --input
 *   popup    bg --surface, radius --radius-lg (8px), shadow --shadow
 *   item     h-32px, px-8px, radius --radius-sm (5px), highlight --surface-hover
 *   ring     3px --ring; invalid ring 3px --destructive at 30%
 * trace.tokens.json has no hover role, so the package tokens.css is imported and
 * --surface-hover used directly; --border matches the popup fill, so menu
 * separators also use --surface-hover.
 */

export type TriggerState = "default" | "hover" | "focus" | "open" | "disabled" | "invalid";
export type TriggerSize = "default" | "sm";

type SpecTriggerProps = HTMLAttributes<HTMLDivElement> & {
  size?: TriggerSize;
  state?: TriggerState;
  value?: string;
  placeholder?: string;
  icon?: ReactNode;
};

export function SpecTrigger({
  size = "default",
  state = "default",
  value,
  placeholder = "Select…",
  icon,
  className,
  ...props
}: SpecTriggerProps) {
  return (
    <div
      role="presentation"
      data-state={state}
      className={cn(
        "flex items-center gap-2 border bg-design-surface font-design-body text-sm text-design-foreground transition-all duration-design ease-design",
        size === "default" ? "h-8 rounded-[6px] px-3" : "h-7 rounded-[6px] px-2.5",
        state === "hover" ? "border-[var(--surface-hover)]" : "border-design-border",
        state === "focus" && "shadow-[0_0_0_3px_var(--ring)]",
        state === "open" && "border-design-primary",
        state === "disabled" && "cursor-not-allowed opacity-50",
        state === "invalid" && "border-design-danger shadow-[0_0_0_3px_rgba(239,68,68,0.3)]",
        className,
      )}
      {...props}
    >
      {icon ? <span className="shrink-0 text-design-muted [&_svg]:size-4">{icon}</span> : null}
      <span className={cn("min-w-0 flex-1 truncate text-left", !value && "text-design-muted")}>
        {value ?? placeholder}
      </span>
      <ChevronDownIcon
        className={cn(
          "size-4 shrink-0 text-design-muted transition-transform duration-design",
          state === "open" && "rotate-180",
        )}
      />
    </div>
  );
}

export function SpecMenu({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[8px] border border-design-border bg-design-surface p-1 font-design-body text-sm text-design-foreground shadow-design-surface",
        className,
      )}
      {...props}
    />
  );
}

type SpecItemProps = HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
  selected?: boolean;
  highlighted?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  /** Set false only for menus that opt out of selection checks entirely. */
  checkSlot?: boolean;
};

export function SpecItem({
  icon,
  selected,
  highlighted,
  disabled,
  destructive,
  checkSlot = true,
  className,
  children,
  ...props
}: SpecItemProps) {
  return (
    <div
      role="presentation"
      className={cn(
        "flex h-8 items-center gap-2 rounded-[5px] px-2",
        destructive ? "text-design-danger" : "text-design-foreground",
        highlighted && (destructive ? "bg-[rgba(239,68,68,0.12)]" : "bg-[var(--surface-hover)]"),
        disabled && "opacity-50",
        className,
      )}
      {...props}
    >
      {icon ? (
        <span className={cn("shrink-0 [&_svg]:size-4", destructive ? "text-design-danger" : "text-design-muted")}>
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {checkSlot ? (
        <span className="ml-2 flex w-4 shrink-0 justify-center">
          {selected ? <CheckIcon className="size-4" /> : null}
        </span>
      ) : null}
    </div>
  );
}

export function SpecGroupLabel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("px-2 py-1.5 text-xs text-design-muted", className)} {...props} />
  );
}

export function SpecSeparator({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mx-1 my-1 h-px bg-[var(--surface-hover)]", className)} {...props} />;
}

export function SpecScrollButton({
  direction,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { direction: "up" | "down" }) {
  return (
    <div
      className={cn("flex h-6 items-center justify-center text-design-muted", className)}
      {...props}
    >
      {direction === "up" ? <ChevronUpIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
    </div>
  );
}
