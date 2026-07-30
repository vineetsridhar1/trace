import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import type {
  RepoApplicationDefinition,
  RepoEnvVar,
  RepoPortDefinition,
  RepoProcessDefinition,
} from "@trace/gql";
import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { SessionAutomationEnvVars } from "./SessionAutomationEnvVars";
import { AutomationSection } from "./SessionAutomationSetupScripts";
import type { EnvTarget } from "./useSessionAutomationDraft";

type Props = {
  applications: RepoApplicationDefinition[];
  expandedProcessId: string | null;
  secretNames: string[];
  onAddApplication: () => void;
  onAddEnv: (target: EnvTarget) => void;
  onAddPort: (applicationId: string, processId: string) => void;
  onAddProcess: (applicationId: string) => void;
  onRemoveApplication: (id: string) => void;
  onRemoveEnv: (target: EnvTarget, index: number) => void;
  onRemovePort: (applicationId: string, processId: string, portId: string) => void;
  onRemoveProcess: (applicationId: string, processId: string) => void;
  onSetExpanded: (id: string | null) => void;
  onUpdateApplication: (id: string, patch: Partial<RepoApplicationDefinition>) => void;
  onUpdateEnv: (target: EnvTarget, index: number, patch: Partial<RepoEnvVar>) => void;
  onUpdatePort: (
    applicationId: string,
    processId: string,
    portId: string,
    patch: Partial<RepoPortDefinition>,
  ) => void;
  onUpdateProcess: (
    applicationId: string,
    processId: string,
    patch: Partial<RepoProcessDefinition>,
  ) => void;
  onManageSecrets: () => void;
};

export function SessionAutomationApplications(props: Props) {
  return (
    <AutomationSection
      title="Applications"
      description="Long-running processes Trace starts and supervises inside cloud sessions, with the ports they expose."
      actionLabel="Add application"
      onAdd={props.onAddApplication}
    >
      <div className="space-y-3">
        {props.applications.map((application) => (
          <div key={application.id} className="rounded-xl border border-border bg-card">
            <div className="flex items-end justify-between gap-3 rounded-t-xl bg-background/30 px-4 py-3.5">
              <Field label="Application name" className="w-56">
                <Input
                  value={application.name}
                  placeholder="Application"
                  onChange={(event) =>
                    props.onUpdateApplication(application.id, { name: event.target.value })
                  }
                  className="h-9 bg-background text-[13px]"
                />
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove application ${application.name || "application"}`}
                onClick={() => props.onRemoveApplication(application.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 size={14} />
              </Button>
            </div>

            {application.processes.map((process) =>
              props.expandedProcessId === process.id ? (
                <ExpandedProcess
                  key={process.id}
                  applicationId={application.id}
                  process={process}
                  {...props}
                />
              ) : (
                <CollapsedProcess
                  key={process.id}
                  process={process}
                  onExpand={() => props.onSetExpanded(process.id)}
                  onRemove={() => props.onRemoveProcess(application.id, process.id)}
                />
              ),
            )}

            <div className="border-t border-border px-4 py-2.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => props.onAddProcess(application.id)}
              >
                <Plus size={14} />
                Add process to {application.name || "application"}
              </Button>
            </div>
          </div>
        ))}
        {!props.applications.length ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
            No applications configured.
          </p>
        ) : null}
      </div>
    </AutomationSection>
  );
}

function CollapsedProcess({
  process,
  onExpand,
  onRemove,
}: {
  process: RepoProcessDefinition;
  onExpand: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 border-t border-border px-4 py-2.5">
      <button
        type="button"
        onClick={onExpand}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <ChevronRight size={13} className="shrink-0 text-muted-foreground" />
        <span className="w-32 shrink-0 truncate text-[13px] font-medium text-foreground">
          {process.name || "Unnamed process"}
        </span>
        <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
          {process.command || "No command"}
        </code>
        {process.required ? (
          <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            Starts with app
          </span>
        ) : null}
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {process.ports.length} port{process.ports.length === 1 ? "" : "s"}
        </span>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Remove process ${process.name || "process"}`}
        onClick={onRemove}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 size={14} />
      </Button>
    </div>
  );
}

function ExpandedProcess({
  applicationId,
  process,
  secretNames,
  onAddEnv,
  onAddPort,
  onRemoveEnv,
  onRemovePort,
  onRemoveProcess,
  onSetExpanded,
  onUpdateEnv,
  onUpdatePort,
  onUpdateProcess,
  onManageSecrets,
}: Props & { applicationId: string; process: RepoProcessDefinition }) {
  const target: EnvTarget = { type: "process", applicationId, processId: process.id };
  return (
    <div className="space-y-3 border-t border-border bg-background/20 px-4 py-4">
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-end gap-4">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Collapse ${process.name || "process"}`}
            onClick={() => onSetExpanded(null)}
          >
            <ChevronDown size={13} />
          </Button>
          <Field label="Process name" className="w-52">
            <Input
              value={process.name}
              placeholder="Process"
              onChange={(event) =>
                onUpdateProcess(applicationId, process.id, { name: event.target.value })
              }
              className="h-9 bg-background text-[13px]"
            />
          </Field>
          <label className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <MiniToggle
              on={process.required}
              onChange={(required) => onUpdateProcess(applicationId, process.id, { required })}
              label={`Starts with app: ${process.name || "process"}`}
            />
            Starts with app
          </label>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove process ${process.name || "process"}`}
          onClick={() => onRemoveProcess(applicationId, process.id)}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 size={14} />
        </Button>
      </div>
      <div className="grid grid-cols-[1fr_180px] gap-3">
        <Field label="Command">
          <Input
            value={process.command}
            onChange={(event) =>
              onUpdateProcess(applicationId, process.id, { command: event.target.value })
            }
            className="h-9 bg-background font-mono text-xs"
          />
        </Field>
        <Field label="Working directory">
          <Input
            value={process.workingDirectory ?? "."}
            onChange={(event) =>
              onUpdateProcess(applicationId, process.id, {
                workingDirectory: event.target.value,
              })
            }
            className="h-9 bg-background font-mono text-xs"
          />
        </Field>
      </div>
      <SessionAutomationEnvVars
        env={process.env}
        target={target}
        secretNames={secretNames}
        onAdd={onAddEnv}
        onRemove={onRemoveEnv}
        onUpdate={onUpdateEnv}
        onManageSecrets={onManageSecrets}
      />
      <PortsEditor
        applicationId={applicationId}
        process={process}
        onAdd={onAddPort}
        onRemove={onRemovePort}
        onUpdate={onUpdatePort}
      />
    </div>
  );
}

function PortsEditor({
  applicationId,
  process,
  onAdd,
  onRemove,
  onUpdate,
}: {
  applicationId: string;
  process: RepoProcessDefinition;
  onAdd: (applicationId: string, processId: string) => void;
  onRemove: (applicationId: string, processId: string, portId: string) => void;
  onUpdate: Props["onUpdatePort"];
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium text-muted-foreground">Ports</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onAdd(applicationId, process.id)}
        >
          <Plus size={13} />
          Add port
        </Button>
      </div>
      {process.ports.length ? (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_72px_88px_1fr_64px_32px] items-center gap-2 px-px text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <span>Label</span>
            <span>Port</span>
            <span>Protocol</span>
            <span>Health</span>
            <span>Forward</span>
            <span />
          </div>
          {process.ports.map((port) => (
            <div
              key={port.id}
              className="grid grid-cols-[1fr_72px_88px_1fr_64px_32px] items-center gap-2"
            >
              <Input
                value={port.label}
                onChange={(event) =>
                  onUpdate(applicationId, process.id, port.id, { label: event.target.value })
                }
                className="h-9 bg-background text-xs"
              />
              <Input
                type="number"
                min={1024}
                max={65535}
                value={port.port}
                onChange={(event) =>
                  onUpdate(applicationId, process.id, port.id, {
                    port: Number(event.target.value),
                  })
                }
                className="h-9 bg-background px-2 font-mono text-xs"
              />
              <Select
                value={port.protocol}
                onValueChange={(protocol) =>
                  onUpdate(applicationId, process.id, port.id, {
                    protocol: protocol ?? "http",
                  })
                }
              >
                <SelectTrigger className="h-9 bg-background px-2 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">http</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={port.healthPath ?? ""}
                placeholder="/health"
                onChange={(event) =>
                  onUpdate(applicationId, process.id, port.id, {
                    healthPath: event.target.value || null,
                  })
                }
                className="h-9 bg-background font-mono text-xs"
              />
              <div className="flex justify-center">
                <MiniToggle
                  on={port.defaultForwardingEnabled}
                  onChange={(defaultForwardingEnabled) =>
                    onUpdate(applicationId, process.id, port.id, {
                      defaultForwardingEnabled,
                    })
                  }
                  label={`Auto-forward ${port.label || "port"}`}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove port ${port.label || port.port}`}
                onClick={() => onRemove(applicationId, process.id, port.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No ports configured.</p>
      )}
      <p className="mt-1.5 text-xs leading-4 text-muted-foreground">
        Auto-forwarded ports become preview links once the health check passes.
      </p>
    </div>
  );
}

function MiniToggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn(
        "relative flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors",
        on ? "border-primary bg-primary" : "border-border bg-background",
      )}
    >
      <span
        className={cn(
          "absolute h-3.5 w-3.5 rounded-full transition-all",
          on ? "left-[18px] bg-primary-foreground" : "left-[2px] bg-muted-foreground",
        )}
      />
    </button>
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
