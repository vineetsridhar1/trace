import type { DesignSystem } from "@trace/gql";
import { Palette } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

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
  if (system.latestCommitArtifact?.status === "saved" && !system.latestCommitArtifact.packageValid) {
    return "Needs repair";
  }
  if (system.publishStatus === "failed") return "Version failed";
  return "Waiting for first commit";
}

export function DesignSystemCombobox({
  systems,
  value,
  onValueChange,
}: {
  systems: DesignSystem[];
  value: string;
  onValueChange: (value: string) => void;
}) {
  const unavailable = unavailableDesignSystems(systems);
  const selectable = selectableDesignSystems(systems);
  const selectedSystem = selectable.find((system) => system.activeVersionId === value);
  return (
    <Select value={value} onValueChange={(next) => next && onValueChange(next)}>
      <SelectTrigger
        className="h-7 w-auto max-w-[260px] cursor-pointer gap-1.5 rounded-lg border-none bg-transparent px-2 text-[11px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="Design library"
      >
        <Palette className="size-3.5 shrink-0" />
        <SelectValue>
          {value === TRACE_DEFAULT_DESIGN_SYSTEM
            ? "Trace Default"
            : selectedSystem
              ? `${selectedSystem.name} · v${selectedSystem.activeVersion?.version ?? "–"}`
              : "Design library"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TRACE_DEFAULT_DESIGN_SYSTEM}>Trace Default</SelectItem>
        {selectable.map((system) => (
          <SelectItem key={system.id} value={system.activeVersionId!}>
            {system.name} · v{system.activeVersion?.version ?? "–"}
            {system.sourceRepo?.name ? ` · ${system.sourceRepo.name}` : ""}
          </SelectItem>
        ))}
        {unavailable.length > 0 ? (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Not ready</SelectLabel>
              {unavailable.map((system) => (
                <SelectItem key={system.id} value={`unavailable:${system.id}`} disabled>
                  {system.name} · {designSystemAvailabilityLabel(system)}
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        ) : null}
        <SelectSeparator />
        <SelectItem value={CREATE_DESIGN_SYSTEM}>Create new design system…</SelectItem>
      </SelectContent>
    </Select>
  );
}
