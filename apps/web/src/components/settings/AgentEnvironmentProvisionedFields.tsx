import { AlertCircle, Check, Shield } from "lucide-react";
import type { OrgSecret } from "@trace/gql";
import { cn } from "../../lib/utils";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import type {
  AgentEnvironmentDraft,
  UpdateAgentEnvironmentDraft,
} from "./agent-environment-form-types";
import { AgentEnvironmentRuntimeEnvFields } from "./AgentEnvironmentRuntimeEnvFields";

type Props = {
  draft: AgentEnvironmentDraft;
  orgSecrets: OrgSecret[];
  update: UpdateAgentEnvironmentDraft;
};

export function AgentEnvironmentProvisionedFields({ draft, orgSecrets, update }: Props) {
  const selectedSecret = orgSecrets.find((secret) => secret.id === draft.authSecretId);
  const metadataValidity = getMetadataValidity(draft.launcherMetadata);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Launcher endpoints</p>
        <div className="space-y-2">
          <EndpointField
            label="Start"
            method="POST"
            value={draft.startUrl}
            onChange={(value) => update("startUrl", value)}
          />
          <EndpointField
            label="Stop"
            method="POST"
            value={draft.stopUrl}
            onChange={(value) => update("stopUrl", value)}
          />
          <EndpointField
            label="Status"
            method="GET"
            value={draft.statusUrl}
            onChange={(value) => update("statusUrl", value)}
          />
        </div>
        <p className="mt-1.5 text-xs leading-4 text-muted-foreground">
          Requests are sent with the bearer secret below. Paths can live on any host you control.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            Bearer secret
            <span className="rounded-full border border-border px-1.5 py-px text-[10px] font-medium">
              Required
            </span>
          </span>
          <Select
            value={selectedSecret?.id}
            disabled={!orgSecrets.length}
            onValueChange={(value) => update("authSecretId", value ?? "")}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select an organization secret">
                <span className="flex min-w-0 items-center gap-1.5">
                  {selectedSecret ? (
                    <Shield size={13} className="shrink-0 text-muted-foreground" />
                  ) : null}
                  <span className="truncate font-mono text-xs">
                    {selectedSecret?.name ?? "Select an organization secret"}
                  </span>
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {orgSecrets.map((secret) => (
                <SelectItem key={secret.id} value={secret.id}>
                  <Shield size={13} />
                  {secret.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1.5 text-xs leading-4 text-muted-foreground">
            Manage values in Workspace → Secrets.
          </p>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Startup timeout
          </span>
          <div className="relative">
            <Input
              type="number"
              min={1}
              value={draft.startupTimeoutSeconds}
              onChange={(event) => update("startupTimeoutSeconds", event.target.value)}
              className="h-9 bg-background pr-16 text-[13px]"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              seconds
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-4 text-muted-foreground">
            Wait before a start fails.
          </p>
        </label>
      </div>

      <AgentEnvironmentRuntimeEnvFields draft={draft} orgSecrets={orgSecrets} update={update} />

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Launcher metadata · optional
        </span>
        <Textarea
          value={draft.launcherMetadata}
          onChange={(event) => update("launcherMetadata", event.target.value)}
          aria-invalid={metadataValidity === "invalid"}
          className="min-h-24 resize-none bg-background font-mono text-xs leading-5"
        />
        <p
          className={cn(
            "mt-1 flex items-center gap-1.5 text-xs",
            metadataValidity === "invalid" ? "text-destructive" : "text-emerald-400",
          )}
        >
          {metadataValidity === "invalid" ? (
            <AlertCircle size={12} className="shrink-0" />
          ) : (
            <Check size={12} className="shrink-0" />
          )}
          {metadataValidity === "invalid"
            ? "Enter a valid JSON object."
            : "Valid JSON — sent with every start request for provider-specific settings."}
        </p>
      </label>
    </div>
  );
}

function EndpointField({
  label,
  method,
  value,
  onChange,
}: {
  label: string;
  method: "GET" | "POST";
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="w-12 shrink-0 rounded-md border border-border bg-background py-1 text-center font-mono text-[10px] text-muted-foreground">
        {method}
      </span>
      <Input
        aria-label={`${label} URL`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 bg-background font-mono text-xs"
      />
    </label>
  );
}

function getMetadataValidity(value: string): "valid" | "invalid" {
  if (!value.trim()) return "valid";
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? "valid"
      : "invalid";
  } catch {
    return "invalid";
  }
}
