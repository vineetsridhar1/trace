import type { OrgSecret } from "@trace/gql";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import type {
  AgentEnvironmentDraft,
  UpdateAgentEnvironmentDraft,
} from "./agent-environment-form-types";
import { AgentEnvironmentFieldLabel } from "./AgentEnvironmentFieldLabel";

type Props = {
  draft: AgentEnvironmentDraft;
  orgSecrets: OrgSecret[];
  update: UpdateAgentEnvironmentDraft;
};

export function AgentEnvironmentProvisionedFields({ draft, orgSecrets, update }: Props) {
  const selectedSecret = orgSecrets.find((secret) => secret.id === draft.authSecretId);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <label className="space-y-4">
          <AgentEnvironmentFieldLabel tooltip="Trace calls this endpoint to provision a new cloud runtime for a session.">
            Start URL
          </AgentEnvironmentFieldLabel>
          <Input
            value={draft.startUrl}
            onChange={(event) => update("startUrl", event.target.value)}
          />
        </label>
        <label className="space-y-4">
          <AgentEnvironmentFieldLabel tooltip="Trace calls this endpoint when the session ends so the launcher can stop and clean up the runtime.">
            Stop URL
          </AgentEnvironmentFieldLabel>
          <Input
            value={draft.stopUrl}
            onChange={(event) => update("stopUrl", event.target.value)}
          />
        </label>
        <label className="space-y-4">
          <AgentEnvironmentFieldLabel tooltip="Trace polls this endpoint while the runtime is starting to learn when it is ready.">
            Status URL
          </AgentEnvironmentFieldLabel>
          <Input
            value={draft.statusUrl}
            onChange={(event) => update("statusUrl", event.target.value)}
          />
        </label>
      </div>
      <label className="space-y-4">
        <AgentEnvironmentFieldLabel tooltip="Select the organization secret used as the bearer token for launcher requests. Configure secrets in Settings, Launcher Secrets.">
          Bearer secret
        </AgentEnvironmentFieldLabel>
        <Select
          value={selectedSecret?.id}
          disabled={!orgSecrets.length}
          onValueChange={(value) => update("authSecretId", value ?? "")}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select an organization secret">
              {selectedSecret?.name ?? "Select an organization secret"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {orgSecrets.map((secret) => (
              <SelectItem key={secret.id} value={secret.id}>
                {secret.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="space-y-4">
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
      <label className="space-y-4">
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
