import type { OrgSecret } from "@trace/gql";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import type {
  AgentEnvironmentDraft,
  UpdateAgentEnvironmentDraft,
} from "./agent-environment-form-types";

type Props = {
  draft: AgentEnvironmentDraft;
  orgSecrets: OrgSecret[];
  update: UpdateAgentEnvironmentDraft;
};

export function AgentEnvironmentProvisionedFields({ draft, orgSecrets, update }: Props) {
  const selectedSecret = orgSecrets.find((secret) => secret.id === draft.authSecretId);
  const selectedSecretId = selectedSecret ? draft.authSecretId : "__manual__";

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-surface-deep p-3 md:grid-cols-2">
      <label className="space-y-1.5 md:col-span-2">
        <span className="text-xs font-medium text-muted-foreground">Start URL</span>
        <Input
          value={draft.startUrl}
          onChange={(event) => update("startUrl", event.target.value)}
        />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Stop URL</span>
        <Input value={draft.stopUrl} onChange={(event) => update("stopUrl", event.target.value)} />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Status URL</span>
        <Input
          value={draft.statusUrl}
          onChange={(event) => update("statusUrl", event.target.value)}
        />
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Bearer secret</span>
        {orgSecrets.length ? (
          <Select
            value={selectedSecretId}
            onValueChange={(value) =>
              update("authSecretId", value === "__manual__" ? "" : (value ?? ""))
            }
          >
            <SelectTrigger>
              <SelectValue>{selectedSecret?.name ?? "Enter secret ID"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {orgSecrets.map((secret) => (
                <SelectItem key={secret.id} value={secret.id}>
                  {secret.name}
                </SelectItem>
              ))}
              <SelectItem value="__manual__">Enter secret ID</SelectItem>
            </SelectContent>
          </Select>
        ) : null}
        {orgSecrets.length === 0 || selectedSecretId === "__manual__" ? (
          <Input
            value={draft.authSecretId}
            onChange={(event) => update("authSecretId", event.target.value)}
          />
        ) : null}
      </label>
      <label className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Startup timeout seconds</span>
        <Input
          type="number"
          min={1}
          value={draft.startupTimeoutSeconds}
          onChange={(event) => update("startupTimeoutSeconds", event.target.value)}
        />
      </label>
      <label className="space-y-1.5 md:col-span-2">
        <span className="text-xs font-medium text-muted-foreground">Deprovision policy</span>
        <Select
          value={draft.deprovisionPolicy}
          onValueChange={(value) =>
            update("deprovisionPolicy", value as AgentEnvironmentDraft["deprovisionPolicy"])
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="on_session_end">On session end</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <label className="space-y-1.5 md:col-span-2">
        <span className="text-xs font-medium text-muted-foreground">Launcher metadata JSON</span>
        <Textarea
          value={draft.launcherMetadata}
          onChange={(event) => update("launcherMetadata", event.target.value)}
          className="min-h-20 font-mono text-xs"
        />
      </label>
    </div>
  );
}
