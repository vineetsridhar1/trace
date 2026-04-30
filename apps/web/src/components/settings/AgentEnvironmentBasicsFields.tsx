import { Input } from "../ui/input";
import type {
  AgentEnvironmentDraft,
  UpdateAgentEnvironmentDraft,
} from "./agent-environment-form-types";
import { formatAdapterType } from "./agent-environment-utils";

type Props = {
  draft: AgentEnvironmentDraft;
  update: UpdateAgentEnvironmentDraft;
};

export function AgentEnvironmentBasicsFields({ draft, update }: Props) {
  return (
    <>
      <div className="grid gap-3 md:grid-cols-[1fr_180px]">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Name</span>
          <Input
            value={draft.name}
            onChange={(event) => update("name", event.target.value)}
            required
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Adapter</span>
          <Input value={formatAdapterType(draft.adapterType)} disabled />
        </label>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => update("enabled", event.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Enabled
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={draft.isDefault}
            onChange={(event) => update("isDefault", event.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Default for organization
        </label>
      </div>
    </>
  );
}
