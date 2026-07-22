import type { DesignSystem } from "@trace/gql";
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
  return (
    <Select value={value} onValueChange={(next) => next && onValueChange(next)}>
      <SelectTrigger className="w-full" aria-label="Design system">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TRACE_DEFAULT_DESIGN_SYSTEM}>Trace Default</SelectItem>
        {selectableDesignSystems(systems).map((system) => (
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
