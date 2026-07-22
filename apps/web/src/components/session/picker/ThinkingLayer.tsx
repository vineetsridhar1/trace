import { motion } from "framer-motion";
import { ArrowLeft, Check } from "lucide-react";
import type { ReasoningEffortOption } from "../modelOptions";
import { LAYER_TRANSITION } from "./pickerShared";
import { useListboxNav } from "./useListboxNav";

interface ThinkingLayerProps {
  effort: string;
  options: readonly ReasoningEffortOption[];
  pending: boolean;
  onBack: () => void;
  onSelect: (effort: string) => void;
}

export function ThinkingLayer({
  effort,
  options,
  pending,
  onBack,
  onSelect,
}: ThinkingLayerProps) {
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === effort),
  );
  const { containerProps, registerItem } = useListboxNav(options.length, selectedIndex);

  return (
    <motion.div
      key="thinking"
      initial={{ x: 18, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 18, opacity: 0 }}
      transition={LAYER_TRANSITION}
      className="space-y-1"
    >
      <div className="mb-1 flex h-8 items-center gap-1">
        <button
          type="button"
          onClick={onBack}
          className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-white/10 hover:text-foreground focus-visible:bg-white/10 focus-visible:text-foreground"
          aria-label="Back to tools"
        >
          <ArrowLeft className="size-4" />
        </button>
        <span className="truncate text-sm font-medium">Thinking</span>
      </div>
      <div aria-label="Select thinking level" {...containerProps}>
        {options.map((option, index) => {
          const selected = option.value === effort;

          return (
            <button
              key={option.value}
              ref={registerItem(index)}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={pending}
              onClick={() => onSelect(option.value)}
              className="flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-sm text-popover-foreground outline-none transition-colors hover:bg-white/10 focus-visible:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {selected ? <Check className="size-4 text-foreground" /> : null}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
