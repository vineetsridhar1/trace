import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import {
  getDefaultModel,
  getModelLabel,
  getModelProviderForModel,
  getModelProviderGroupsForTool,
  getModelsForTool,
  getReasoningEffortLabel,
  type ReasoningEffortOption,
} from "./modelOptions";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { ActionTooltip } from "../ui/ActionTooltip";
import {
  ToolIcon,
  getToolLabel,
  normalizeTool,
  type PickerLayer,
  type ToolOptionValue,
} from "./picker/pickerShared";
import { ToolLayer } from "./picker/ToolLayer";
import { ProviderLayer } from "./picker/ProviderLayer";
import { ModelLayer } from "./picker/ModelLayer";
import { ReasoningEffortMenu } from "./picker/ReasoningEffortMenu";

interface ToolModelPickerProps {
  tool: ToolOptionValue;
  model?: string | null;
  reasoningEffort?: string | null;
  reasoningEffortOptions?: readonly ReasoningEffortOption[];
  disabled?: boolean;
  onToolChange: (tool: ToolOptionValue) => Promise<void> | void;
  onModelChange: (model: string) => Promise<void> | void;
  onReasoningEffortChange?: (effort: string) => Promise<void> | void;
}

export function ToolModelPicker({
  tool,
  model,
  reasoningEffort,
  reasoningEffortOptions = [],
  disabled,
  onToolChange,
  onModelChange,
  onReasoningEffortChange,
}: ToolModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [layer, setLayer] = useState<PickerLayer>("tools");
  const [pickerTool, setPickerTool] = useState<ToolOptionValue>(normalizeTool(tool));
  const [pickerProvider, setPickerProvider] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const activeModel =
    pickerTool === tool ? (model ?? getDefaultModel(pickerTool)) : getDefaultModel(pickerTool);
  const providerGroups = getModelProviderGroupsForTool(pickerTool);
  const activeProvider =
    providerGroups.find((group) => group.value === pickerProvider) ??
    getModelProviderForModel(pickerTool, activeModel) ??
    providerGroups[0];
  const modelOptions = activeProvider?.models ?? getModelsForTool(pickerTool);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      const nextTool = normalizeTool(tool);
      setLayer("tools");
      setPickerTool(nextTool);
      setPickerProvider(getModelProviderForModel(nextTool, model)?.value ?? null);
    }
  }

  async function handleToolSelect(nextTool: ToolOptionValue) {
    setPickerTool(nextTool);
    const nextProviderGroups = getModelProviderGroupsForTool(nextTool);
    const nextProvider =
      nextTool === tool
        ? getModelProviderForModel(nextTool, model)?.value
        : nextProviderGroups[0]?.value;
    setPickerProvider(nextProvider ?? null);

    if (nextTool !== tool) {
      setPending(true);
      try {
        await onToolChange(nextTool);
      } finally {
        setPending(false);
      }
    }

    // Tools with no selectable model (e.g. Antigravity) have nothing more to
    // pick — apply the tool and close rather than showing an empty model layer.
    if (nextProviderGroups.length > 0) {
      setLayer("providers");
    } else if (getModelsForTool(nextTool).length > 0) {
      setLayer("models");
    } else {
      setOpen(false);
    }
  }

  function handleProviderSelect(provider: string) {
    setPickerProvider(provider);
    setLayer("models");
  }

  function handleModelBack() {
    setLayer(providerGroups.length > 0 ? "providers" : "tools");
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

  async function handleReasoningEffortSelect(nextEffort: string) {
    if (!onReasoningEffortChange || nextEffort === reasoningEffort) return;
    setPending(true);
    try {
      await onReasoningEffortChange(nextEffort);
    } finally {
      setPending(false);
    }
  }

  const modelLabel = model ? getModelLabel(model) : "Model";
  const effortLabel = reasoningEffort ? getReasoningEffortLabel(reasoningEffort) : null;
  const compactLabel = `${getToolLabel(tool)} / ${modelLabel}${effortLabel ? ` · Thinking: ${effortLabel}` : ""}`;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <ActionTooltip label={compactLabel} className="lg:hidden">
        <PopoverTrigger
          disabled={disabled}
          aria-label={compactLabel}
          className="flex size-7 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ToolIcon tool={tool} className="size-3.5 shrink-0" />
        </PopoverTrigger>
      </ActionTooltip>
      <PopoverTrigger
        disabled={disabled}
        className="hidden h-7 w-auto max-w-[260px] cursor-pointer items-center gap-1.5 rounded-lg border-none bg-transparent px-2 text-[11px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 lg:flex"
      >
        <ToolIcon tool={tool} className="size-3.5 shrink-0" />
        <span className="truncate">{getToolLabel(tool)}</span>
        {getModelsForTool(tool).length > 0 ? (
          <>
            <span className="text-muted-foreground/60">/</span>
            <span className="truncate">{modelLabel}</span>
          </>
        ) : null}
        <ChevronDown className="size-3.5 shrink-0" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 overflow-hidden p-1.5">
        <AnimatePresence mode="wait" initial={false}>
          {layer === "tools" ? (
            <ToolLayer
              key="tools"
              currentTool={tool}
              pending={pending}
              onSelect={handleToolSelect}
            />
          ) : layer === "providers" ? (
            <ProviderLayer
              key="providers"
              pickerTool={pickerTool}
              providerGroups={providerGroups}
              activeProviderValue={activeProvider?.value}
              pending={pending}
              onBack={() => setLayer("tools")}
              onSelect={handleProviderSelect}
            />
          ) : (
            <ModelLayer
              key="models"
              pickerTool={pickerTool}
              headerLabel={activeProvider?.label ?? getToolLabel(pickerTool)}
              modelOptions={modelOptions}
              activeModel={activeModel}
              pending={pending}
              hasProviders={providerGroups.length > 0}
              onBack={handleModelBack}
              onSelect={handleModelSelect}
            />
          )}
        </AnimatePresence>
        <div className="lg:hidden">
          <ReasoningEffortMenu
            effort={reasoningEffort ?? reasoningEffortOptions[0]?.value ?? ""}
            options={reasoningEffortOptions}
            pending={pending}
            onSelect={handleReasoningEffortSelect}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
