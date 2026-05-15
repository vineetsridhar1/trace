import { motion } from "framer-motion";
import { ArrowLeft, Check, ChevronRight } from "lucide-react";
import type { ModelProviderGroup } from "@trace/shared";
import { cn } from "../../../lib/utils";
import { LAYER_TRANSITION, ToolIcon, getToolLabel, type ToolOptionValue } from "./pickerShared";
import { useListboxNav } from "./useListboxNav";

interface ProviderLayerProps {
  pickerTool: ToolOptionValue;
  providerGroups: readonly ModelProviderGroup[];
  activeProviderValue: string | undefined;
  pending: boolean;
  onBack: () => void;
  onSelect: (provider: string) => void;
}

export function ProviderLayer({
  pickerTool,
  providerGroups,
  activeProviderValue,
  pending,
  onBack,
  onSelect,
}: ProviderLayerProps) {
  const selectedIndex = Math.max(
    0,
    providerGroups.findIndex((group) => group.value === activeProviderValue),
  );
  const { containerProps, registerItem } = useListboxNav(providerGroups.length, selectedIndex);

  return (
    <motion.div
      key="providers"
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
        <ToolIcon tool={pickerTool} className="size-4" />
        <span className="truncate text-sm font-medium">{getToolLabel(pickerTool)}</span>
      </div>
      <div aria-label={`Select ${getToolLabel(pickerTool)} provider`} {...containerProps}>
        {providerGroups.map((group, index) => {
          const selected = activeProviderValue === group.value;
          return (
            <button
              key={group.value}
              ref={registerItem(index)}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={pending}
              onClick={() => onSelect(group.value)}
              className="flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-sm text-popover-foreground outline-none transition-colors hover:bg-white/10 focus-visible:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate">{group.label}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {group.description}
                </span>
              </span>
              {selected ? <Check className="size-4 text-foreground" /> : null}
              <ChevronRight
                className={cn(
                  "size-4",
                  selected ? "text-foreground" : "text-muted-foreground",
                )}
              />
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
