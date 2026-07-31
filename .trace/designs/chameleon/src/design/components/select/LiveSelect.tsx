import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import "../../../../design-system/tokens.css";
import { cn } from "../../lib/cn";
import { CheckIcon, ChevronDownIcon } from "./icons";

export type LiveSelectOption = {
  value: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
};

type LiveSelectProps = {
  label: string;
  options: LiveSelectOption[];
  defaultValue?: string;
  placeholder?: string;
  size?: "default" | "sm";
  className?: string;
  menuClassName?: string;
  "data-trace-id"?: string;
  "data-trace-source"?: string;
};

/**
 * Working prototype of the specified Select (local state only) so reviewers can
 * feel the open/highlight/select interaction. Same recipe as SelectMock.
 */
export function LiveSelect({
  label,
  options,
  defaultValue,
  placeholder = "Select…",
  size = "default",
  className,
  menuClassName,
  ...trace
}: LiveSelectProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string | undefined>(defaultValue);
  const [active, setActive] = useState<number>(() =>
    Math.max(
      0,
      options.findIndex((option) => option.value === defaultValue),
    ),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const move = (delta: number) => {
    let next = active;
    for (let step = 0; step < options.length; step += 1) {
      next = (next + delta + options.length) % options.length;
      if (!options[next].disabled) break;
    }
    setActive(next);
  };

  return (
    <div ref={rootRef} className={cn("relative", className)} {...trace}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={label}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) setOpen(true);
            else move(event.key === "ArrowDown" ? 1 : -1);
          }
          if ((event.key === "Enter" || event.key === " ") && open) {
            event.preventDefault();
            const option = options[active];
            if (option && !option.disabled) {
              setValue(option.value);
              setOpen(false);
            }
          }
        }}
        className={cn(
          "flex w-full items-center gap-2 border bg-design-surface font-design-body text-sm text-design-foreground outline-none transition-all duration-design ease-design",
          size === "default" ? "h-8 rounded-[6px] px-3" : "h-7 rounded-[6px] px-2.5",
          open ? "border-design-primary" : "border-design-border hover:border-[var(--surface-hover)]",
          "focus-visible:shadow-[0_0_0_3px_var(--ring)]",
        )}
      >
        {selected?.icon ? (
          <span className="shrink-0 text-design-muted [&_svg]:size-4">{selected.icon}</span>
        ) : null}
        <span className={cn("min-w-0 flex-1 truncate text-left", !selected && "text-design-muted")}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 text-design-muted transition-transform duration-design",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={label}
          className={cn(
            "absolute left-0 top-full z-20 mt-1 min-w-full rounded-[8px] border border-design-border bg-design-surface p-1 shadow-design-surface",
            menuClassName,
          )}
        >
          {options.map((option, index) => (
            <div
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              aria-disabled={option.disabled || undefined}
              onPointerEnter={() => !option.disabled && setActive(index)}
              onClick={() => {
                if (option.disabled) return;
                setValue(option.value);
                setOpen(false);
              }}
              className={cn(
                "flex h-8 cursor-pointer items-center gap-2 rounded-[5px] px-2 text-sm text-design-foreground",
                index === active && !option.disabled && "bg-[var(--surface-hover)]",
                option.disabled && "cursor-not-allowed opacity-50",
              )}
            >
              {option.icon ? (
                <span className="shrink-0 text-design-muted [&_svg]:size-4">{option.icon}</span>
              ) : null}
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              <span className="ml-2 flex w-4 shrink-0 justify-center">
                {option.value === value ? <CheckIcon className="size-4" /> : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
