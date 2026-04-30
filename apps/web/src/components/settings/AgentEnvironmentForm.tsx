import { useEffect, useState } from "react";
import { Loader2, Plus, Save } from "lucide-react";
import type { AgentEnvironment, CodingTool, OrgSecret } from "@trace/gql";
import { client } from "../../lib/urql";
import { Button } from "../ui/button";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "../ui/responsive-dialog";
import {
  environmentConfig,
  type LocalBridgeSummary,
  supportedToolsFromConfig,
} from "./agent-environment-utils";
import {
  CREATE_AGENT_ENVIRONMENT_MUTATION,
  UPDATE_AGENT_ENVIRONMENT_MUTATION,
} from "./agent-environment-queries";
import { AgentEnvironmentBasicsFields } from "./AgentEnvironmentBasicsFields";
import { AgentEnvironmentLocalFields } from "./AgentEnvironmentLocalFields";
import { AgentEnvironmentProvisionedFields } from "./AgentEnvironmentProvisionedFields";
import { AgentEnvironmentSupportedToolsField } from "./AgentEnvironmentSupportedToolsField";
import { ANY_LOCAL_RUNTIME, type AgentEnvironmentDraft } from "./agent-environment-form-types";

type Props = {
  open: boolean;
  organizationId: string;
  environment: AgentEnvironment | null;
  localBridges: LocalBridgeSummary[];
  orgSecrets: OrgSecret[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

function createDraft(environment: AgentEnvironment | null): AgentEnvironmentDraft {
  const config = environmentConfig(environment);
  const runtimeInstanceId = config.runtimeInstanceId?.trim();
  const launcherMetadata = config.launcherMetadata
    ? JSON.stringify(config.launcherMetadata, null, 2)
    : "";

  return {
    name: environment?.name ?? "",
    adapterType: environment?.adapterType ?? "provisioned",
    enabled: environment?.enabled ?? true,
    isDefault: environment?.isDefault ?? false,
    supportedTools: supportedToolsFromConfig(config),
    runtimeSelection: runtimeInstanceId ?? ANY_LOCAL_RUNTIME,
    startUrl: config.startUrl ?? "",
    stopUrl: config.stopUrl ?? "",
    statusUrl: config.statusUrl ?? "",
    authSecretId: config.auth?.secretId ?? "",
    startupTimeoutSeconds: String(config.startupTimeoutSeconds ?? 180),
    deprovisionPolicy: config.deprovisionPolicy ?? "on_session_end",
    launcherMetadata,
  };
}

function buildCapabilities(tools: CodingTool[]): Record<string, unknown> | undefined {
  return tools.length ? { supportedTools: tools } : undefined;
}

function buildConfig(draft: AgentEnvironmentDraft): Record<string, unknown> {
  const capabilities = buildCapabilities(draft.supportedTools);
  if (draft.adapterType === "local") {
    return {
      ...(draft.runtimeSelection === ANY_LOCAL_RUNTIME
        ? { runtimeSelection: "any_accessible_local" }
        : { runtimeInstanceId: draft.runtimeSelection }),
      ...(capabilities ? { capabilities } : {}),
    };
  }

  const metadata = draft.launcherMetadata.trim();
  return {
    startUrl: draft.startUrl.trim(),
    stopUrl: draft.stopUrl.trim(),
    statusUrl: draft.statusUrl.trim(),
    auth: { type: "bearer", secretId: draft.authSecretId.trim() },
    startupTimeoutSeconds: Number(draft.startupTimeoutSeconds),
    deprovisionPolicy: draft.deprovisionPolicy,
    ...(capabilities ? { capabilities } : {}),
    ...(metadata ? { launcherMetadata: JSON.parse(metadata) as Record<string, unknown> } : {}),
  };
}

export function AgentEnvironmentForm({
  open,
  organizationId,
  environment,
  localBridges,
  orgSecrets,
  onOpenChange,
  onSaved,
}: Props) {
  const [draft, setDraft] = useState<AgentEnvironmentDraft>(() => createDraft(environment));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(createDraft(environment));
      setError(null);
    }
  }, [environment, open]);

  const title = environment ? "Edit Agent Environment" : "Create Provisioned Environment";

  function update<K extends keyof AgentEnvironmentDraft>(key: K, value: AgentEnvironmentDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function toggleTool(tool: CodingTool) {
    setDraft((current) => {
      const hasTool = current.supportedTools.includes(tool);
      return {
        ...current,
        supportedTools: hasTool
          ? current.supportedTools.filter((candidate) => candidate !== tool)
          : [...current.supportedTools, tool],
      };
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const config = buildConfig(draft);
      const result = environment
        ? await client
            .mutation(UPDATE_AGENT_ENVIRONMENT_MUTATION, {
              input: {
                id: environment.id,
                name: draft.name.trim(),
                adapterType: draft.adapterType,
                config,
                enabled: draft.enabled,
                isDefault: draft.isDefault,
              },
            })
            .toPromise()
        : await client
            .mutation(CREATE_AGENT_ENVIRONMENT_MUTATION, {
              input: {
                orgId: organizationId,
                name: draft.name.trim(),
                adapterType: draft.adapterType,
                config,
                enabled: draft.enabled,
                isDefault: draft.isDefault,
              },
            })
            .toPromise();

      if (result.error) throw result.error;
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save agent environment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <AgentEnvironmentBasicsFields draft={draft} update={update} />

          {draft.adapterType === "local" ? (
            <AgentEnvironmentLocalFields
              draft={draft}
              localBridges={localBridges}
            />
          ) : (
            <AgentEnvironmentProvisionedFields
              draft={draft}
              orgSecrets={orgSecrets}
              update={update}
            />
          )}

          <AgentEnvironmentSupportedToolsField
            supportedTools={draft.supportedTools}
            onToggle={toggleTool}
          />

          <DialogFooter>
            <Button type="submit" disabled={saving || !draft.name.trim()}>
              {saving ? (
                <Loader2 size={14} className="mr-1.5 animate-spin" />
              ) : environment ? (
                <Save size={14} className="mr-1.5" />
              ) : (
                <Plus size={14} className="mr-1.5" />
              )}
              {saving ? "Saving..." : environment ? "Save changes" : "Create environment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
