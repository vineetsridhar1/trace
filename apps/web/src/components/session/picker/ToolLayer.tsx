import { motion } from "framer-motion";
import { Check, ChevronRight, LoaderCircle } from "lucide-react";
import { cn } from "../../../lib/utils";
import { useCodingToolsStore } from "../../../stores/coding-tools";
import { LAYER_TRANSITION, TOOL_OPTIONS, ToolIcon, type ToolOptionValue } from "./pickerShared";
import { useListboxNav } from "./useListboxNav";

interface ToolLayerProps {
  currentTool: string;
  pending: boolean;
  onSelect: (tool: ToolOptionValue) => void;
}

export function ToolLayer({ currentTool, pending, onSelect }: ToolLayerProps) {
  const statuses = useCodingToolsStore((state) => state.statuses);
  const operations = useCodingToolsStore((state) => state.operations);
  const installOrUpdate = useCodingToolsStore((state) => state.installOrUpdate);
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
        const localStatus = statuses?.find((status) => status.tool === option.value);
        const missing = localStatus?.status === "missing";
        const installing = operations[option.value] === "installing";
        return (
          <div key={option.value} className="flex items-center rounded-md hover:bg-white/10">
            <button
              ref={registerItem(index)}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={pending}
              onClick={() => onSelect(option.value)}
              className="flex h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm text-popover-foreground outline-none focus-visible:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ToolIcon tool={option.value} className={cn("size-4", missing && "opacity-50")} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{option.label}</span>
                {missing ? (
                  <span className="block text-[10px] leading-3 text-muted-foreground">
                    Not installed on this computer
                  </span>
                ) : null}
              </span>
              {selected ? <Check className="size-4 text-foreground" /> : null}
              <ChevronRight
                className={cn("size-4", selected ? "text-foreground" : "text-muted-foreground")}
              />
            </button>
            {missing ? (
              <button
                type="button"
                disabled={installing}
                onClick={() => void installOrUpdate(option.value).catch(() => undefined)}
                className="mr-1.5 rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-foreground transition-colors hover:border-muted-foreground disabled:opacity-50"
              >
                {installing ? <LoaderCircle className="size-3.5 animate-spin" /> : "Install"}
              </button>
            ) : null}
          </div>
        );
      })}
    </motion.div>
  );
}
