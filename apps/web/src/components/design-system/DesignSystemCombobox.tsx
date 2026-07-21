import type { DesignSystem } from "@trace/gql";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

export const TRACE_DEFAULT_DESIGN_SYSTEM = "__trace_default__";
export const CREATE_DESIGN_SYSTEM = "__create_design_system__";
export function selectableDesignSystems(systems: DesignSystem[]): DesignSystem[] {
  return systems.filter(
    (system) => system.status === "ready" && system.activeVersionId && !system.archivedAt,
  );
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
        <SelectItem value={CREATE_DESIGN_SYSTEM}>Create new design system…</SelectItem>
      </SelectContent>
    </Select>
  );
}
