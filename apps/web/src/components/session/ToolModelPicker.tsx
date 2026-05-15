import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, ChevronDown, ChevronRight } from "lucide-react";
import {
  getDefaultModel,
  getModelLabel,
  getModelProviderGroupsForTool,
  getModelsForTool,
} from "./modelOptions";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { ClaudeIcon, CodexIcon, PiIcon } from "../ui/tool-icons";
import { cn } from "../../lib/utils";

const TOOL_OPTIONS = [
  { value: "claude_code", label: "Claude Code" },
  { value: "codex", label: "Codex" },
  { value: "pi", label: "Pi" },
] as const;

type ToolOptionValue = (typeof TOOL_OPTIONS)[number]["value"];

interface ToolModelPickerProps {
  tool: string;
  model?: string | null;
  disabled?: boolean;
  onToolChange: (tool: ToolOptionValue) => Promise<void> | void;
  onModelChange: (model: string) => Promise<void> | void;
}

function ToolIcon({ tool, className }: { tool: string; className?: string }) {
  if (tool === "claude_code") return <ClaudeIcon className={className} />;
  if (tool === "pi") return <PiIcon className={className} />;
  return <CodexIcon className={className} />;
}

function getToolLabel(tool: string): string {
  return TOOL_OPTIONS.find((option) => option.value === tool)?.label ?? tool;
}

function normalizeTool(tool: string): ToolOptionValue {
  return tool === "codex" || tool === "pi" ? tool : "claude_code";
}

export function ToolModelPicker({
  tool,
  model,
  disabled,
  onToolChange,
  onModelChange,
}: ToolModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [layer, setLayer] = useState<"tools" | "models">("tools");
  const [pickerTool, setPickerTool] = useState<ToolOptionValue>(normalizeTool(tool));
  const [pending, setPending] = useState(false);

  const activeModel =
    pickerTool === tool ? (model ?? getDefaultModel(pickerTool)) : getDefaultModel(pickerTool);
  const providerGroups = useMemo(() => getModelProviderGroupsForTool(pickerTool), [pickerTool]);
  const groupedModelOptions = useMemo(
    () =>
      providerGroups.length > 0
        ? providerGroups
        : [
            {
              value: "models",
              label: "Models",
              description: "",
              models: getModelsForTool(pickerTool),
            },
          ],
    [pickerTool, providerGroups],
  );

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setLayer("tools");
      setPickerTool(normalizeTool(tool));
    }
  }

  async function handleToolSelect(nextTool: ToolOptionValue) {
    setPickerTool(nextTool);
    setPending(true);
    try {
      if (nextTool !== tool) {
        await onToolChange(nextTool);
      }
      setLayer("models");
    } finally {
      setPending(false);
    }
  }

  async function handleModelSelect(nextModel: string) {
    setPending(true);
    try {
      if (nextModel !== model) {
        await onModelChange(nextModel);
      }
      setOpen(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        disabled={disabled}
        className="flex h-7 w-auto max-w-[260px] cursor-pointer items-center gap-1.5 rounded-lg border-none bg-transparent px-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ToolIcon tool={tool} className="size-3.5 shrink-0" />
        <span className="truncate">{getToolLabel(tool)}</span>
        <span className="text-muted-foreground/60">/</span>
        <span className="truncate">{model ? getModelLabel(model) : "Model"}</span>
        <ChevronDown className="size-3.5 shrink-0" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 overflow-hidden p-1.5">
        <AnimatePresence mode="wait" initial={false}>
          {layer === "tools" ? (
            <motion.div
              key="tools"
              initial={{ x: -18, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -18, opacity: 0 }}
              transition={{ duration: 0.14 }}
              className="space-y-1"
            >
              {TOOL_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={pending}
                  onClick={() => void handleToolSelect(option.value)}
                  className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-popover-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                >
                  <ToolIcon tool={option.value} className="size-4" />
                  <span className="flex-1 truncate">{option.label}</span>
                  {tool === option.value ? (
                    <Check className="size-4 text-muted-foreground" />
                  ) : null}
                  <ChevronRight className="size-4 text-muted-foreground" />
                </button>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="models"
              initial={{ x: 18, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 18, opacity: 0 }}
              transition={{ duration: 0.14 }}
              className="space-y-1"
            >
              <div className="mb-1 flex h-8 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setLayer("tools")}
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                  aria-label="Back to tools"
                >
                  <ArrowLeft className="size-4" />
                </button>
                <ToolIcon tool={pickerTool} className="size-4" />
                <span className="truncate text-sm font-medium">{getToolLabel(pickerTool)}</span>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {groupedModelOptions.map((group) => (
                  <div key={group.value} className="space-y-1">
                    {providerGroups.length > 0 ? (
                      <div className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                        {group.label}
                      </div>
                    ) : null}
                    {group.models.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        disabled={pending}
                        onClick={() => void handleModelSelect(option.value)}
                        className={cn(
                          "flex min-h-8 w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50",
                          activeModel === option.value
                            ? "text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        <span className="flex-1 truncate">{option.label}</span>
                        {activeModel === option.value ? <Check className="size-4" /> : null}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </PopoverContent>
    </Popover>
  );
}
