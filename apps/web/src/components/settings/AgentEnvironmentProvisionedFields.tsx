import { Info } from "lucide-react";
import type { OrgSecret } from "@trace/gql";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
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

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Start URL</span>
          <Input
            value={draft.startUrl}
            onChange={(event) => update("startUrl", event.target.value)}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Stop URL</span>
          <Input
            value={draft.stopUrl}
            onChange={(event) => update("stopUrl", event.target.value)}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Status URL</span>
          <Input
            value={draft.statusUrl}
            onChange={(event) => update("statusUrl", event.target.value)}
          />
        </label>
      </div>
      <label className="space-y-1.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          Bearer secret
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex" />}>
              <Info size={13} className="text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent side="right">
              Configure organization secrets in Settings, Launcher Secrets.
            </TooltipContent>
          </Tooltip>
        </span>
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
      <label className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Startup timeout seconds</span>
        <Input
          type="number"
          min={1}
          value={draft.startupTimeoutSeconds}
          onChange={(event) => update("startupTimeoutSeconds", event.target.value)}
        />
      </label>
      <label className="space-y-1.5">
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
