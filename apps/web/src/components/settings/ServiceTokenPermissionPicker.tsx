import { Check } from "lucide-react";
import type { ServiceApiScope } from "@trace/gql";
import { AVAILABLE_SERVICE_SCOPES } from "./service-access-token-options";

export function ServiceTokenPermissionPicker({
  scopes,
  onToggle,
}: {
  scopes: readonly ServiceApiScope[];
  onToggle: (scope: ServiceApiScope) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-foreground">Permissions</legend>
      {AVAILABLE_SERVICE_SCOPES.map((scope) => {
        const selected = scopes.includes(scope.id);
        return (
          <button
            key={scope.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggle(scope.id)}
            className="flex w-full items-start gap-3 rounded-lg border border-border bg-surface-deep p-3 text-left transition-colors hover:bg-surface-hover"
          >
            <span
              className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border ${
                selected ? "border-primary bg-primary text-primary-foreground" : "border-input"
              }`}
            >
              {selected ? <Check size={12} /> : null}
            </span>
            <span>
              <span className="block text-sm text-foreground">{scope.label}</span>
              <span className="block text-xs text-muted-foreground">{scope.description}</span>
            </span>
          </button>
        );
      })}
    </fieldset>
  );
}
