import type { OrgSecret } from "@trace/gql";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import type {
  AgentEnvironmentDraft,
  UpdateAgentEnvironmentDraft,
} from "./agent-environment-form-types";
import { AgentEnvironmentFieldLabel } from "./AgentEnvironmentFieldLabel";
import { AgentEnvironmentRuntimeEnvFields } from "./AgentEnvironmentRuntimeEnvFields";

type Props = {
  draft: AgentEnvironmentDraft;
  orgSecrets: OrgSecret[];
  update: UpdateAgentEnvironmentDraft;
};

export function AgentEnvironmentProvisionedFields({ draft, orgSecrets, update }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <AgentEnvironmentFieldLabel tooltip="Trace calls this endpoint to provision a new cloud runtime for a session.">
            Start URL
          </AgentEnvironmentFieldLabel>
          <Input
            value={draft.startUrl}
            onChange={(event) => update("startUrl", event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <AgentEnvironmentFieldLabel tooltip="Trace calls this endpoint when the session ends so the launcher can stop and clean up the runtime.">
            Stop URL
          </AgentEnvironmentFieldLabel>
          <Input
            value={draft.stopUrl}
            onChange={(event) => update("stopUrl", event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <AgentEnvironmentFieldLabel tooltip="Trace polls this endpoint while the runtime is starting to learn when it is ready.">
            Status URL
          </AgentEnvironmentFieldLabel>
          <Input
            value={draft.statusUrl}
            onChange={(event) => update("statusUrl", event.target.value)}
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        The launcher bearer token is sourced from the TRACE_CLOUD_LAUNCHER_TOKEN environment
        variable.
      </p>
      <AgentEnvironmentRuntimeEnvFields draft={draft} orgSecrets={orgSecrets} update={update} />
      <label className="flex flex-col gap-1.5">
        <AgentEnvironmentFieldLabel tooltip="How long Trace waits for the provisioned runtime to connect before treating startup as failed.">
          Startup timeout seconds
        </AgentEnvironmentFieldLabel>
        <Input
          type="number"
          min={1}
          value={draft.startupTimeoutSeconds}
          onChange={(event) => update("startupTimeoutSeconds", event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <AgentEnvironmentFieldLabel tooltip="Optional JSON sent to the launcher with each start request for provider-specific settings.">
          Launcher metadata JSON
        </AgentEnvironmentFieldLabel>
        <Textarea
          value={draft.launcherMetadata}
          onChange={(event) => update("launcherMetadata", event.target.value)}
          className="min-h-20 font-mono text-xs"
        />
      </label>
    </div>
  );
}
