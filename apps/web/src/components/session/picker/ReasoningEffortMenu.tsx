import { Check } from "lucide-react";
import { cn } from "../../../lib/utils";
import type { ReasoningEffortOption } from "../modelOptions";

interface ReasoningEffortMenuProps {
  effort: string;
  options: readonly ReasoningEffortOption[];
  pending: boolean;
  onSelect: (effort: string) => void;
}

export function ReasoningEffortMenu({
  effort,
  options,
  pending,
  onSelect,
}: ReasoningEffortMenuProps) {
  if (options.length === 0) return null;

  return (
    <div className="mt-1 border-t border-border/60 pt-1.5">
      <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">Thinking</p>
      <div className="grid grid-cols-3 gap-1 px-1">
        {options.map((option) => {
          const selected = option.value === effort;

          return (
            <button
              key={option.value}
              type="button"
              disabled={pending}
              onClick={() => onSelect(option.value)}
              className={cn(
                "flex min-h-8 min-w-0 cursor-pointer items-center justify-center gap-1 rounded-md px-2 py-1 text-center text-xs leading-tight outline-none transition-colors hover:bg-white/10 focus-visible:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50",
                selected ? "bg-white/10 text-foreground" : "text-muted-foreground",
              )}
            >
              <span>{option.label}</span>
              {selected ? <Check className="size-3.5" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
