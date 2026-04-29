import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Save } from "lucide-react";
import type {
  AgentEnvironment,
  AgentEnvironmentAdapterType,
  CodingTool,
  SessionRuntimeInstance,
} from "@trace/gql";
import { client } from "../../lib/urql";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "../ui/responsive-dialog";
import {
  CODING_TOOL_OPTIONS,
  environmentConfig,
  runtimeRepoNames,
  supportedToolsFromConfig,
} from "./agent-environment-utils";
import {
  CREATE_AGENT_ENVIRONMENT_MUTATION,
  UPDATE_AGENT_ENVIRONMENT_MUTATION,
} from "./agent-environment-queries";

const ANY_LOCAL_RUNTIME = "__any_accessible_local__";

type Props = {
  open: boolean;
  organizationId: string;
  environment: AgentEnvironment | null;
  localRuntimes: SessionRuntimeInstance[];
  repoNamesById: Map<string, string>;
  onOpenChange: (open: boolean) => void;
  onSaved: (environment: AgentEnvironment) => void;
};

type Draft = {
  name: string;
  adapterType: AgentEnvironmentAdapterType;
  enabled: boolean;
  isDefault: boolean;
  supportedTools: CodingTool[];
  runtimeSelection: string;
  startUrl: string;
  stopUrl: string;
  statusUrl: string;
  authSecretId: string;
  startupTimeoutSeconds: string;
  deprovisionPolicy: "on_session_end" | "manual";
  launcherMetadata: string;
};

function createDraft(environment: AgentEnvironment | null): Draft {
  const config = environmentConfig(environment);
  const runtimeInstanceId = config.runtimeInstanceId?.trim();
  const launcherMetadata = config.launcherMetadata
    ? JSON.stringify(config.launcherMetadata, null, 2)
    : "";

  return {
    name: environment?.name ?? "",
    adapterType: environment?.adapterType ?? "local",
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

function buildConfig(draft: Draft): Record<string, unknown> {
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
  localRuntimes,
  repoNamesById,
  onOpenChange,
  onSaved,
}: Props) {
  const [draft, setDraft] = useState<Draft>(() => createDraft(environment));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(createDraft(environment));
      setError(null);
    }
  }, [environment, open]);

  const title = environment ? "Edit Agent Environment" : "Create Agent Environment";
  const runtimeOptions = useMemo(
    () => localRuntimes.filter((runtime) => runtime.hostingMode === "local"),
    [localRuntimes],
  );

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
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
      const saved = (
        environment ? result.data?.updateAgentEnvironment : result.data?.createAgentEnvironment
      ) as AgentEnvironment | undefined;
      if (saved) onSaved(saved);
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
              <Select
                value={draft.adapterType}
                onValueChange={(value) =>
                  update("adapterType", value as AgentEnvironmentAdapterType)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Local</SelectItem>
                  <SelectItem value="provisioned">Provisioned</SelectItem>
                </SelectContent>
              </Select>
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

          {draft.adapterType === "local" ? (
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
                    {runtimeOptions.map((runtime) => (
                      <SelectItem key={runtime.id} value={runtime.id}>
                        {runtime.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <div className="mt-3 space-y-2">
                {runtimeOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No connected local bridges found.</p>
                ) : (
                  runtimeOptions.map((runtime) => (
                    <div key={runtime.id} className="rounded-md bg-surface-elevated px-3 py-2">
                      <div className="text-xs font-medium text-foreground">{runtime.label}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {runtimeRepoNames(runtime, repoNamesById)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
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
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Bearer secret ID</span>
                <Input
                  value={draft.authSecretId}
                  onChange={(event) => update("authSecretId", event.target.value)}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Startup timeout seconds
                </span>
                <Input
                  type="number"
                  min={1}
                  value={draft.startupTimeoutSeconds}
                  onChange={(event) => update("startupTimeoutSeconds", event.target.value)}
                />
              </label>
              <label className="space-y-1.5 md:col-span-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Deprovision policy
                </span>
                <Select
                  value={draft.deprovisionPolicy}
                  onValueChange={(value) =>
                    update("deprovisionPolicy", value as Draft["deprovisionPolicy"])
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
                <span className="text-xs font-medium text-muted-foreground">
                  Launcher metadata JSON
                </span>
                <Textarea
                  value={draft.launcherMetadata}
                  onChange={(event) => update("launcherMetadata", event.target.value)}
                  className="min-h-20 font-mono text-xs"
                />
              </label>
            </div>
          )}

          <div className="rounded-lg border border-border bg-surface-deep p-3">
            <div className="mb-2 text-xs font-medium text-muted-foreground">Supported tools</div>
            <div className="flex flex-wrap gap-4">
              {CODING_TOOL_OPTIONS.map((tool) => (
                <label key={tool.value} className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={draft.supportedTools.includes(tool.value)}
                    onChange={() => toggleTool(tool.value)}
                    className="h-4 w-4 rounded border-border"
                  />
                  {tool.label}
                </label>
              ))}
            </div>
          </div>

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
