import type { SupportedAppIntegration } from "@trace/gql";
import { Check } from "lucide-react";
import { cn } from "../../../lib/utils";

export function AppIntegrationCapabilityPicker({
  integration,
  selectedIds,
  onToggle,
}: {
  integration: SupportedAppIntegration;
  selectedIds: string[];
  onToggle: (capabilityId: string) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-foreground">What can this app do?</p>
      <div className="grid gap-1.5">
        {integration.capabilities.map((capability) => {
          const selected = selectedIds.includes(capability.id);
          return (
            <button
              key={capability.id}
              type="button"
              aria-pressed={selected}
              className={cn(
                "flex items-start gap-2 rounded-md border p-2 text-left transition-colors",
                selected
                  ? "border-primary/50 bg-primary/10"
                  : "border-border bg-background/40 hover:bg-muted/50",
              )}
              onClick={() => onToggle(capability.id)}
            >
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border border-border">
                {selected ? <Check size={11} /> : null}
              </span>
              <span>
                <span className="block text-xs font-medium text-foreground">{capability.name}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {capability.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
