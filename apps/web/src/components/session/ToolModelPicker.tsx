import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import {
  getDefaultModel,
  getModelLabel,
  getModelProviderForModel,
  getModelProviderGroupsForTool,
  getModelsForTool,
  getModelSelectionOptionsForTool,
} from "./modelOptions";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
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

interface ToolModelPickerProps {
  tool: ToolOptionValue;
  model?: string | null;
  modelSelectionMode?: string | null;
  autoSelectedModel?: string | null;
  disabled?: boolean;
  onToolChange: (tool: ToolOptionValue) => Promise<void> | void;
  onModelChange: (model: string) => Promise<void> | void;
}

export function ToolModelPicker({
  tool,
  model,
  modelSelectionMode,
  autoSelectedModel,
  disabled,
  onToolChange,
  onModelChange,
}: ToolModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [layer, setLayer] = useState<PickerLayer>("tools");
  const [pickerTool, setPickerTool] = useState<ToolOptionValue>(normalizeTool(tool));
  const [pickerProvider, setPickerProvider] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const activeModel =
    pickerTool === tool
      ? modelSelectionMode === "auto"
        ? "auto"
        : (model ?? getDefaultModel(pickerTool))
      : getDefaultModel(pickerTool);
  const providerGroups = getModelProviderGroupsForTool(pickerTool);
  const activeProvider =
    providerGroups.find((group) => group.value === pickerProvider) ??
    getModelProviderForModel(pickerTool, activeModel) ??
    providerGroups[0];
  const modelOptions = activeProvider
    ? [{ value: "auto", label: "Auto" }, ...activeProvider.models]
    : getModelSelectionOptionsForTool(pickerTool);
  const modelLabel =
    modelSelectionMode === "auto"
      ? autoSelectedModel
        ? `Auto: ${getModelLabel(autoSelectedModel)}`
        : "Auto selecting..."
      : model
        ? getModelLabel(model)
        : "Model";

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

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        disabled={disabled}
        className="flex h-7 w-auto max-w-[260px] cursor-pointer items-center gap-1.5 rounded-lg border-none bg-transparent px-2 text-[11px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
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
      </PopoverContent>
    </Popover>
  );
}
