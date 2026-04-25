import { useCallback, useRef, useState } from "react";
import { CheckIcon } from "lucide-react";
import type { ModelOption } from "@trace/shared";
import { cn } from "../../lib/utils";
import { Sheet, SheetContent } from "../ui/sheet";

interface MobileModelSelectorProps {
  value: string | undefined;
  label: string;
  options: readonly ModelOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
}

export function MobileModelSelector({
  value,
  label,
  options,
  disabled,
  onChange,
}: MobileModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const handledTouchRef = useRef(false);

  const commit = useCallback(
    (nextValue: string) => {
      onChange(nextValue);
      setOpen(false);
    },
    [onChange],
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="flex h-7 w-auto cursor-pointer items-center gap-1.5 rounded-lg bg-transparent px-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="line-clamp-1">{label}</span>
      </button>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-0 rounded-t-xl px-0 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="flex justify-center pb-2 pt-3">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>
        <div className="flex flex-col pb-2">
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onPointerUp={(event) => {
                  if (event.pointerType !== "touch") return;
                  event.preventDefault();
                  handledTouchRef.current = true;
                  commit(option.value);
                }}
                onClick={() => {
                  if (handledTouchRef.current) {
                    handledTouchRef.current = false;
                    return;
                  }
                  commit(option.value);
                }}
                className={cn(
                  "flex min-h-12 touch-manipulation items-center gap-3 px-5 py-3 text-left text-sm text-foreground active:bg-muted",
                  selected && "font-medium",
                )}
              >
                <span className="flex-1">{option.label}</span>
                {selected && <CheckIcon className="size-4 text-accent" />}
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
