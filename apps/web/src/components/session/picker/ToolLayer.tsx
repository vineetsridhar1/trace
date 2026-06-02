import { motion } from "framer-motion";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "../../../lib/utils";
import { LAYER_TRANSITION, TOOL_OPTIONS, ToolIcon, type ToolOptionValue } from "./pickerShared";
import { useListboxNav } from "./useListboxNav";

interface ToolLayerProps {
  currentTool: string;
  pending: boolean;
  disabledToolReasons?: Partial<Record<ToolOptionValue, string>>;
  onSelect: (tool: ToolOptionValue) => void;
}

export function ToolLayer({
  currentTool,
  pending,
  disabledToolReasons,
  onSelect,
}: ToolLayerProps) {
  const selectedIndex = Math.max(
    0,
    TOOL_OPTIONS.findIndex((option) => option.value === currentTool),
  );
  const { containerProps, registerItem } = useListboxNav(TOOL_OPTIONS.length, selectedIndex);

  return (
    <motion.div
      key="tools"
      initial={{ x: -18, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -18, opacity: 0 }}
      transition={LAYER_TRANSITION}
      className="space-y-1"
      aria-label="Select coding tool"
      {...containerProps}
    >
      {TOOL_OPTIONS.map((option, index) => {
        const selected = currentTool === option.value;
        const disabledReason = selected ? undefined : disabledToolReasons?.[option.value];
        const disabled = pending || !!disabledReason;
        return (
          <button
            key={option.value}
            ref={registerItem(index)}
            type="button"
            role="option"
            aria-selected={selected}
            disabled={disabled}
            title={disabledReason}
            onClick={() => onSelect(option.value)}
            className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm text-popover-foreground outline-none transition-colors hover:bg-white/10 focus-visible:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ToolIcon tool={option.value} className="size-4" />
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            {disabledReason ? (
              <span className="shrink-0 text-[10px] text-muted-foreground">not installed</span>
            ) : null}
            {selected ? <Check className="size-4 text-foreground" /> : null}
            {!disabledReason ? (
              <ChevronRight
                className={cn(
                  "size-4",
                  selected ? "text-foreground" : "text-muted-foreground",
                )}
              />
            ) : null}
          </button>
        );
      })}
    </motion.div>
  );
}
