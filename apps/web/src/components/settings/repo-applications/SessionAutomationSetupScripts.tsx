import { Plus, Trash2 } from "lucide-react";
import type { RepoEnvVar, RepoSetupScript } from "@trace/gql";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { SessionAutomationEnvVars } from "./SessionAutomationEnvVars";
import type { EnvTarget } from "./useSessionAutomationDraft";

export function SessionAutomationSetupScripts({
  scripts,
  secretNames,
  onAdd,
  onRemove,
  onUpdate,
  onAddEnv,
  onRemoveEnv,
  onUpdateEnv,
  onManageSecrets,
}: {
  scripts: RepoSetupScript[];
  secretNames: string[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<RepoSetupScript>) => void;
  onAddEnv: (target: EnvTarget) => void;
  onRemoveEnv: (target: EnvTarget, index: number) => void;
  onUpdateEnv: (target: EnvTarget, index: number, patch: Partial<RepoEnvVar>) => void;
  onManageSecrets: () => void;
}) {
  return (
    <AutomationSection
      title="Setup scripts"
      description="Run in order when a session workspace starts. Terminals, run scripts, and applications all wait until every step finishes."
      actionLabel="Add step"
      onAdd={onAdd}
    >
      <div className="space-y-2.5">
        {scripts.map((script, index) => (
          <div key={script.id} className="rounded-xl border border-border bg-card">
            <div className="flex gap-3 px-4 py-4">
              <span className="mt-6 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-background text-[11px] font-semibold text-muted-foreground">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex items-end justify-between gap-3">
                  <Field label="Step name" className="w-56">
                    <Input
                      value={script.name}
                      onChange={(event) => onUpdate(script.id, { name: event.target.value })}
                      className="h-9 border-border bg-background px-3 text-[13px] focus-visible:ring-2 focus-visible:ring-primary/25"
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove step ${script.name || index + 1}`}
                    onClick={() => onRemove(script.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
                <div className="grid grid-cols-[1fr_180px] gap-3">
                  <Field label="Command">
                    <Input
                      value={script.command}
                      onChange={(event) => onUpdate(script.id, { command: event.target.value })}
                      className="h-9 border-border bg-background px-3 font-mono text-xs focus-visible:ring-2 focus-visible:ring-primary/25"
                    />
                  </Field>
                  <Field label="Working directory">
                    <Input
                      value={script.workingDirectory ?? "."}
                      onChange={(event) =>
                        onUpdate(script.id, { workingDirectory: event.target.value })
                      }
                      className="h-9 border-border bg-background px-3 font-mono text-xs focus-visible:ring-2 focus-visible:ring-primary/25"
                    />
                  </Field>
                </div>
                <SessionAutomationEnvVars
                  env={script.env}
                  target={{ type: "setup", scriptId: script.id }}
                  secretNames={secretNames}
                  onAdd={onAddEnv}
                  onRemove={onRemoveEnv}
                  onUpdate={onUpdateEnv}
                  onManageSecrets={onManageSecrets}
                />
              </div>
            </div>
          </div>
        ))}
        {!scripts.length ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
            No setup steps configured.
          </p>
        ) : null}
      </div>
    </AutomationSection>
  );
}

export function AutomationSection({
  title,
  description,
  actionLabel,
  onAdd,
  children,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-3.5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 max-w-[30rem] text-xs leading-4 text-muted-foreground">
            {description}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAdd}
          className="h-8 px-2.5 text-[13px]"
        >
          <Plus size={14} />
          {actionLabel}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
    </>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={className}>
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
