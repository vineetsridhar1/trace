import { useState } from "react";
import type { DesignSystem } from "@trace/gql";
import { Check, ChevronDown, Palette } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { cn } from "../../lib/utils";

export const TRACE_DEFAULT_DESIGN_SYSTEM = "__trace_default__";
export const CREATE_DESIGN_SYSTEM = "__create_design_system__";

function isSelectableDesignSystem(system: DesignSystem): boolean {
  return system.status === "ready" && !!system.activeVersionId && !system.archivedAt;
}

export function selectableDesignSystems(systems: DesignSystem[]): DesignSystem[] {
  return systems.filter(isSelectableDesignSystem);
}

export function unavailableDesignSystems(systems: DesignSystem[]): DesignSystem[] {
  return systems.filter((system) => !system.archivedAt && !isSelectableDesignSystem(system));
}

export function designSystemAvailabilityLabel(system: DesignSystem): string {
  if (system.publishStatus === "publishing") return "Publishing…";
  if (system.commitArtifactStatus === "pending" || system.commitArtifactStatus === "saving") {
    return "Saving first version…";
  }
  if (system.commitArtifactStatus === "failed") return "Cloud save failed";
  if (
    system.latestCommitArtifact?.status === "saved" &&
    !system.latestCommitArtifact.packageValid
  ) {
    return "Needs repair";
  }
  if (system.publishStatus === "failed") return "Version failed";
  return "Waiting for first commit";
}

export function designSystemValidationErrors(system: DesignSystem): string[] {
  const summary = system.latestCommitArtifact?.validationSummary;
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return [];
  const errors = (summary as Record<string, unknown>).errors;
  return Array.isArray(errors)
    ? errors.filter((error): error is string => typeof error === "string")
    : [];
}

function optionLabel(system: DesignSystem): string {
  return `${system.name} · v${system.activeVersion?.version ?? "–"}`;
}

export function DesignSystemCombobox({
  systems,
  value,
  onValueChange,
  disabled = false,
}: {
  systems: DesignSystem[];
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectable = selectableDesignSystems(systems);
  const selectedSystem = selectable.find((system) => system.activeVersionId === value);
  const label = value === TRACE_DEFAULT_DESIGN_SYSTEM ? "Trace Default" : selectedSystem?.name;

  function select(nextValue: string) {
    setOpen(false);
    onValueChange(nextValue);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        aria-label="Design library"
        className="flex h-7 w-auto max-w-[260px] cursor-pointer items-center gap-1.5 rounded-lg border-none bg-transparent px-2 text-[11px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Palette className="size-3.5 shrink-0" />
        <span className="truncate">{label ?? "Design library"}</span>
        <ChevronDown className="size-3.5 shrink-0" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 overflow-hidden p-1.5">
        <div role="listbox" aria-label="Select design library" className="space-y-0.5">
          <button
            type="button"
            role="option"
            aria-selected={value === TRACE_DEFAULT_DESIGN_SYSTEM}
            onClick={() => select(TRACE_DEFAULT_DESIGN_SYSTEM)}
            className={cn(
              "flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-sm outline-none transition-colors hover:bg-white/10 hover:text-foreground focus-visible:bg-white/10 focus-visible:text-foreground",
              value === TRACE_DEFAULT_DESIGN_SYSTEM ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <Palette className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">Trace Default</span>
            {value === TRACE_DEFAULT_DESIGN_SYSTEM ? <Check className="size-4" /> : null}
          </button>
          {selectable.map((system) => (
            <button
              key={system.id}
              type="button"
              role="option"
              aria-selected={system.activeVersionId === value}
              onClick={() => select(system.activeVersionId!)}
              className={cn(
                "flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-sm outline-none transition-colors hover:bg-white/10 hover:text-foreground focus-visible:bg-white/10 focus-visible:text-foreground",
                system.activeVersionId === value ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <Palette className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                {optionLabel(system)}
                {system.sourceRepo?.name ? ` · ${system.sourceRepo.name}` : ""}
              </span>
              {system.activeVersionId === value ? <Check className="size-4" /> : null}
            </button>
          ))}
          <div className="my-1 h-px bg-border/60" />
          <button
            type="button"
            onClick={() => select(CREATE_DESIGN_SYSTEM)}
            className="flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-sm text-muted-foreground outline-none transition-colors hover:bg-white/10 hover:text-foreground focus-visible:bg-white/10 focus-visible:text-foreground"
          >
            <span className="size-4 shrink-0 text-center text-base leading-4">+</span>
            <span>Create new design system…</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
