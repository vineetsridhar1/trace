import { motion } from "framer-motion";
import { ArrowLeft, Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import type { ModelOption } from "@trace/shared";
import { cn } from "../../../lib/utils";
import { LAYER_TRANSITION, ToolIcon, getToolLabel, type ToolOptionValue } from "./pickerShared";
import { useListboxNav } from "./useListboxNav";

interface ModelLayerProps {
  pickerTool: ToolOptionValue;
  headerLabel: string;
  modelOptions: readonly ModelOption[];
  recommendedCount?: number;
  activeModel: string | undefined;
  pending: boolean;
  hasProviders: boolean;
  onBack: () => void;
  onSelect: (model: string) => void;
}

export function ModelLayer({
  pickerTool,
  headerLabel,
  modelOptions,
  recommendedCount = modelOptions.length,
  activeModel,
  pending,
  hasProviders,
  onBack,
  onSelect,
}: ModelLayerProps) {
  const [showAll, setShowAll] = useState(activeModel ? modelOptions.slice(recommendedCount).some((model) => model.value === activeModel) : false);
  const visibleModels = showAll ? modelOptions : modelOptions.slice(0, recommendedCount);
  const selectedIndex = Math.max(
    0,
    visibleModels.findIndex((option) => option.value === activeModel),
  );
  const { containerProps, registerItem } = useListboxNav(visibleModels.length, selectedIndex);

  return (
    <motion.div
      key="models"
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
          aria-label={hasProviders ? "Back to providers" : "Back to tools"}
        >
          <ArrowLeft className="size-4" />
        </button>
        <ToolIcon tool={pickerTool} className="size-4" />
        <span className="truncate text-sm font-medium">{headerLabel || getToolLabel(pickerTool)}</span>
      </div>
      <div
        className="max-h-72 overflow-y-auto"
        aria-label={`Select ${headerLabel || getToolLabel(pickerTool)} model`}
        {...containerProps}
      >
        {visibleModels.map((option, index) => {
          const selected = activeModel === option.value;
          return (
            <button
              key={option.value}
              ref={registerItem(index)}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={pending}
              onClick={() => onSelect(option.value)}
              className={cn(
                "flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-sm outline-none transition-colors hover:bg-white/10 hover:text-foreground focus-visible:bg-white/10 focus-visible:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
                selected ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {selected ? <Check className="size-4" /> : null}
            </button>
          );
        })}
        {modelOptions.length > recommendedCount && !showAll ? (
          <button type="button" onClick={() => setShowAll(true)} className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm text-muted-foreground hover:bg-white/10 hover:text-foreground">
            <ChevronDown className="size-4" /> All available models ({modelOptions.length - recommendedCount} more)
          </button>
        ) : null}
      </div>
    </motion.div>
  );
}
