import { useEffect, useState } from "react";
import { PlugZap } from "lucide-react";
import type { AgentEnvironment, OrgSecret } from "@trace/gql";
import { client } from "../../lib/urql";
import { Button } from "../ui/button";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
  ResponsiveDialogDescription as DialogDescription,
} from "../ui/responsive-dialog";
import { TraceLoader } from "../ui/trace-loader";
import { environmentConfig, type LocalBridgeSummary } from "./agent-environment-utils";
import {
  CREATE_AGENT_ENVIRONMENT_MUTATION,
  UPDATE_AGENT_ENVIRONMENT_MUTATION,
} from "./agent-environment-queries";
import { AgentEnvironmentBasicsFields } from "./AgentEnvironmentBasicsFields";
import { AgentEnvironmentLocalFields } from "./AgentEnvironmentLocalFields";
import { AgentEnvironmentProvisionedFields } from "./AgentEnvironmentProvisionedFields";
import { ANY_LOCAL_RUNTIME, type AgentEnvironmentDraft } from "./agent-environment-form-types";

type Props = {
  open: boolean;
  organizationId: string;
  environment: AgentEnvironment | null;
  localBridges: LocalBridgeSummary[];
  orgSecrets: OrgSecret[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  onTest?: () => Promise<TestResult | undefined>;
  testPending?: boolean;
  testResult?: TestResult;
};

type TestResult = {
  ok: boolean;
  message?: string | null;
};

function createDraft(environment: AgentEnvironment | null): AgentEnvironmentDraft {
  const config = environmentConfig(environment);
  const runtimeInstanceId = config.runtimeInstanceId?.trim();
  const launcherMetadata = config.launcherMetadata
    ? JSON.stringify(config.launcherMetadata, null, 2)
    : "";
  const runtimeEnv = Array.isArray(config.runtimeEnv)
    ? config.runtimeEnv.flatMap((entry) =>
        entry && typeof entry === "object" && !Array.isArray(entry)
          ? [
              {
                name: typeof entry.name === "string" ? entry.name : "",
                secretId: typeof entry.secretId === "string" ? entry.secretId : "",
              },
            ]
          : [],
      )
    : [];

  return {
    name: environment?.name ?? "",
    adapterType: environment?.adapterType ?? "provisioned",
    enabled: environment?.enabled ?? true,
    isDefault: environment?.isDefault ?? false,
    runtimeSelection: runtimeInstanceId ?? ANY_LOCAL_RUNTIME,
    startUrl: config.startUrl ?? "",
    stopUrl: config.stopUrl ?? "",
    statusUrl: config.statusUrl ?? "",
    startupTimeoutSeconds: String(config.startupTimeoutSeconds ?? 180),
    runtimeEnv,
    launcherMetadata,
  };
}

function buildConfig(draft: AgentEnvironmentDraft): Record<string, unknown> {
  if (draft.adapterType === "local") {
    return {
      ...(draft.runtimeSelection === ANY_LOCAL_RUNTIME
        ? { runtimeSelection: "any_accessible_local" }
        : { runtimeInstanceId: draft.runtimeSelection }),
    };
  }

  const metadata = draft.launcherMetadata.trim();
  return {
    startUrl: draft.startUrl.trim(),
    stopUrl: draft.stopUrl.trim(),
    statusUrl: draft.statusUrl.trim(),
    auth: { type: "bearer" },
    startupTimeoutSeconds: Number(draft.startupTimeoutSeconds),
    deprovisionPolicy: "on_session_end",
    runtimeEnv: draft.runtimeEnv.filter((entry) => entry.name.trim() && entry.secretId.trim()),
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
  onTest,
  testPending = false,
  testResult,
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

  const isCloud = draft.adapterType === "provisioned";
  const title = environment ? "Edit cloud environment" : "Add cloud environment";

  function update<K extends keyof AgentEnvironmentDraft>(key: K, value: AgentEnvironmentDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
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
                enabled: draft.adapterType === "provisioned" ? true : draft.enabled,
                isDefault: draft.adapterType === "provisioned" ? false : draft.isDefault,
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
                enabled: draft.adapterType === "provisioned" ? true : draft.enabled,
                isDefault: draft.adapterType === "provisioned" ? false : draft.isDefault,
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

  const canSubmit =
    !saving && !!draft.name.trim() && isValidMetadata(draft.launcherMetadata);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-black/60 backdrop-blur-[2px]"
        className="max-h-[calc(100dvh-3rem)] gap-0 overflow-hidden p-0 sm:max-w-[660px]"
      >
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
          <DialogHeader className="shrink-0 gap-0.5 border-b border-border px-6 py-4 pr-14 text-left">
            <DialogTitle className="text-[15px] font-semibold tracking-[-0.01em]">
              {title}
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-5">
              Trace calls these launcher endpoints to start a runtime for each session, poll it
              while it boots, and stop it when the session ends.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {error ? (
              <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <div className="flex flex-col gap-4">
              <AgentEnvironmentBasicsFields draft={draft} update={update} />

              {draft.adapterType === "local" ? (
                <AgentEnvironmentLocalFields draft={draft} localBridges={localBridges} />
              ) : (
                <AgentEnvironmentProvisionedFields
                  draft={draft}
                  orgSecrets={orgSecrets}
                  update={update}
                />
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-background px-6 py-3.5">
            <div className="flex min-w-0 items-center gap-2">
              {isCloud ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!environment || testPending || !onTest}
                  onClick={() => void onTest?.()}
                >
                  {testPending ? (
                    <TraceLoader size={14} showLabel={false} />
                  ) : (
                    <PlugZap size={14} />
                  )}
                  Test connection
                </Button>
              ) : null}
              {isCloud ? (
                <span className="truncate text-xs text-muted-foreground">
                  {environment ? (testResult?.message ?? "Not tested yet") : "Save before testing"}
                </span>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {saving ? <TraceLoader size={14} showLabel={false} /> : null}
                {saving ? "Saving..." : environment ? "Save changes" : "Create environment"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function isValidMetadata(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
  } catch {
    return false;
  }
}
