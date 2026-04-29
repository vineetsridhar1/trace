import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { type LocalBridgeSummary, runtimeRepoNames } from "./agent-environment-utils";
import {
  ANY_LOCAL_RUNTIME,
  type AgentEnvironmentDraft,
  type UpdateAgentEnvironmentDraft,
} from "./agent-environment-form-types";

type Props = {
  draft: AgentEnvironmentDraft;
  localBridges: LocalBridgeSummary[];
  update: UpdateAgentEnvironmentDraft;
};

export function AgentEnvironmentLocalFields({ draft, localBridges, update }: Props) {
  const runtimeOptions = localBridges.filter((bridge) => bridge.connected);

  return (
    <div className="rounded-lg border border-border bg-surface-deep p-3">
      <label className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Runtime selection</span>
        <Select
          value={draft.runtimeSelection}
          onValueChange={(value) => update("runtimeSelection", value ?? ANY_LOCAL_RUNTIME)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_LOCAL_RUNTIME}>Any accessible local bridge</SelectItem>
            {runtimeOptions.map((bridge) => (
              <SelectItem key={bridge.id} value={bridge.id}>
                {bridge.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <div className="mt-3 space-y-2">
        {runtimeOptions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No connected local bridges found.</p>
        ) : (
          runtimeOptions.map((bridge) => (
            <div key={bridge.id} className="rounded-md bg-surface-elevated px-3 py-2">
              <div className="text-xs font-medium text-foreground">{bridge.label}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{runtimeRepoNames(bridge)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
