import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import type {
  RepoApplicationConfig,
  RepoApplicationDefinition,
  RepoEnvVar,
  RepoPortDefinition,
  RepoProcessDefinition,
  RepoSetupScript,
} from "@trace/gql";
import { cn } from "@/lib/utils";
import { Button } from "../../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { Input } from "../../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";

type DraftEnvVar = Omit<RepoEnvVar, "__typename">;
type DraftSetupScript = Omit<RepoSetupScript, "__typename" | "env"> & { env: DraftEnvVar[] };
type DraftPort = Omit<RepoPortDefinition, "__typename">;
type DraftProcess = Omit<RepoProcessDefinition, "__typename" | "env" | "ports"> & {
  env: DraftEnvVar[];
  ports: DraftPort[];
};
type DraftApplication = Omit<RepoApplicationDefinition, "__typename" | "processes"> & {
  processes: DraftProcess[];
};
type DraftConfig = {
  setupScripts: DraftSetupScript[];
  applications: DraftApplication[];
};

const EMPTY_CONFIG: RepoApplicationConfig = { setupScripts: [], applications: [] };

function envVars(env: RepoSetupScript["env"] | RepoProcessDefinition["env"]): DraftEnvVar[] {
  return (env ?? []).map((entry) => ({ key: entry.key, secretName: entry.secretName }));
}

function toEnv(env: DraftEnvVar[]): DraftEnvVar[] {
  return env
    .map((entry) => ({ key: entry.key.trim(), secretName: entry.secretName }))
    .filter((entry) => entry.key && entry.secretName);
}

function slug(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function uniqueId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeConfig(config: RepoApplicationConfig | undefined): DraftConfig {
  const source = config ?? EMPTY_CONFIG;
  return {
    setupScripts: source.setupScripts.map((script) => ({
      id: script.id,
      name: script.name,
      command: script.command,
      workingDirectory: script.workingDirectory ?? ".",
      env: envVars(script.env),
    })),
    applications: source.applications.map((application) => ({
      id: application.id,
      name: application.name,
      processes: application.processes.map((process) => ({
        id: process.id,
        name: process.name,
        command: process.command,
        workingDirectory: process.workingDirectory ?? ".",
        required: process.required,
        env: envVars(process.env),
        ports: process.ports.map((port) => ({
          id: port.id,
          label: port.label,
          port: port.port,
          protocol: port.protocol,
          defaultForwardingEnabled: port.defaultForwardingEnabled,
          healthPath: port.healthPath ?? undefined,
        })),
      })),
    })),
  };
}

function toConfig(draft: DraftConfig): RepoApplicationConfig {
  return {
    setupScripts: draft.setupScripts.map((script) => ({
      id: slug(script.id, slug(script.name, "setup")),
      name: script.name.trim(),
      command: script.command.trim(),
      workingDirectory: script.workingDirectory?.trim() || ".",
      env: toEnv(script.env),
    })),
    applications: draft.applications.map((application) => ({
      id: slug(application.id, slug(application.name, "app")),
      name: application.name.trim(),
      processes: application.processes.map((process) => ({
        id: slug(process.id, slug(process.name, "process")),
        name: process.name.trim(),
        command: process.command.trim(),
        workingDirectory: process.workingDirectory?.trim() || ".",
        required: process.required,
        env: toEnv(process.env),
        ports: process.ports.map((port) => ({
          id: slug(port.id, slug(port.label, "port")),
          label: port.label.trim(),
          port: Number(port.port),
          protocol: port.protocol || "http",
          defaultForwardingEnabled: port.defaultForwardingEnabled,
          healthPath: port.healthPath?.trim() || undefined,
        })),
      })),
    })),
  };
}

function validate(config: RepoApplicationConfig) {
  for (const script of config.setupScripts) {
    if (!script.name || !script.command) throw new Error("Setup scripts need a name and command");
  }
  for (const application of config.applications) {
    if (!application.name) throw new Error("Applications need a name");
    for (const process of application.processes) {
      if (!process.name || !process.command) throw new Error("Processes need a name and command");
      for (const port of process.ports) {
        if (!port.label || !Number.isInteger(port.port) || port.port < 1 || port.port > 65535) {
          throw new Error("Ports need a label and a valid port number");
        }
      }
    }
  }
}

function exampleConfig(): DraftConfig {
  return normalizeConfig({
    setupScripts: [
      { id: "install", name: "Install", command: "pnpm install", workingDirectory: ".", env: [] },
    ],
    applications: [
      {
        id: "web",
        name: "Web",
        processes: [
          {
            id: "dev",
            name: "Dev server",
            command: "pnpm dev --host 0.0.0.0 --port 3000",
            workingDirectory: ".",
            env: [],
            required: true,
            ports: [
              {
                id: "web",
                label: "Web",
                port: 3000,
                protocol: "http",
                defaultForwardingEnabled: true,
              },
            ],
          },
        ],
      },
    ],
  });
}

function FieldLabel({ children }: { children: string }) {
  return <label className="text-[11px] font-medium text-muted-foreground">{children}</label>;
}

function EnvVarsEditor({
  env,
  secretNames,
  onChange,
}: {
  env: DraftEnvVar[];
  secretNames: string[];
  onChange: (env: DraftEnvVar[]) => void;
}) {
  const addVar = () => onChange([...env, { key: "", secretName: secretNames[0] ?? "" }]);
  const updateVar = (index: number, patch: Partial<DraftEnvVar>) =>
    onChange(env.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const removeVar = (index: number) => onChange(env.filter((_, i) => i !== index));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <FieldLabel>Environment variables</FieldLabel>
        <Button
          variant="outline"
          size="sm"
          onClick={addVar}
          disabled={secretNames.length === 0}
          title={secretNames.length === 0 ? "Add org secrets first" : undefined}
        >
          <Plus size={14} />
          Add variable
        </Button>
      </div>
      {secretNames.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Add org secrets in organization settings to reference them here.
        </p>
      ) : env.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No environment variables.</p>
      ) : (
        <div className="space-y-2">
          {env.map((entry, index) => {
            const missing = entry.secretName !== "" && !secretNames.includes(entry.secretName);
            return (
              <div key={index} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                <Input
                  value={entry.key}
                  placeholder="VARIABLE_NAME"
                  className="font-mono text-xs"
                  spellCheck={false}
                  onChange={(event) => updateVar(index, { key: event.target.value })}
                />
                <Select
                  value={entry.secretName || undefined}
                  onValueChange={(value) => updateVar(index, { secretName: value ?? "" })}
                >
                  <SelectTrigger className={cn("text-xs", missing && "border-destructive")}>
                    <SelectValue placeholder="Select secret" />
                  </SelectTrigger>
                  <SelectContent>
                    {missing && (
                      <SelectItem value={entry.secretName} className="text-destructive">
                        {entry.secretName} (missing)
                      </SelectItem>
                    )}
                    {secretNames.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Remove variable"
                  aria-label="Remove variable"
                  onClick={() => removeVar(index)}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ApplicationConfigDialog({
  open,
  config,
  secretNames,
  saving,
  error,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  config: RepoApplicationConfig | undefined;
  secretNames: string[];
  saving: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (config: RepoApplicationConfig) => Promise<void>;
}) {
  const [draft, setDraft] = useState<DraftConfig>(() => normalizeConfig(config));
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(normalizeConfig(config));
      setLocalError(null);
    }
  }, [config, open]);

  const save = async () => {
    setLocalError(null);
    try {
      const nextConfig = toConfig(draft);
      validate(nextConfig);
      await onSave(nextConfig);
      onOpenChange(false);
    } catch (saveError) {
      setLocalError(saveError instanceof Error ? saveError.message : "Failed to save applications");
    }
  };

  const addSetupScript = () => {
    setDraft((current) => ({
      ...current,
      setupScripts: [
        ...current.setupScripts,
        {
          id: uniqueId("setup"),
          name: "Setup script",
          command: "",
          workingDirectory: ".",
          env: [],
        },
      ],
    }));
  };

  const addApplication = () => {
    setDraft((current) => ({
      ...current,
      applications: [
        ...current.applications,
        {
          id: uniqueId("app"),
          name: "Application",
          processes: [],
        },
      ],
    }));
  };

  const formError = localError ?? error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(88dvh,900px)] max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
        showCloseButton={false}
      >
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle>Application configuration</DialogTitle>
              <DialogDescription>
                Configure setup scripts, managed processes, and forwarded ports for cloud sessions.
              </DialogDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setDraft(exampleConfig())}>
              Example
            </Button>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-5 px-5 py-4">
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Setup scripts</p>
                <Button variant="outline" size="sm" onClick={addSetupScript}>
                  <Plus size={14} />
                  Add
                </Button>
              </div>
              {draft.setupScripts.length === 0 ? (
                <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                  No setup scripts.
                </div>
              ) : (
                <div className="space-y-2">
                  {draft.setupScripts.map((script, scriptIndex) => (
                    <div key={script.id} className="rounded-md border border-border/70 bg-background/35 p-3">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-medium text-foreground">{script.name || "Setup script"}</p>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Remove setup script"
                          aria-label="Remove setup script"
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              setupScripts: current.setupScripts.filter((_, index) => index !== scriptIndex),
                            }))
                          }
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1 md:col-span-2">
                          <FieldLabel>Name</FieldLabel>
                          <Input
                            value={script.name}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                setupScripts: current.setupScripts.map((item, index) =>
                                  index === scriptIndex ? { ...item, name: event.target.value } : item,
                                ),
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <FieldLabel>Command</FieldLabel>
                          <Input
                            value={script.command}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                setupScripts: current.setupScripts.map((item, index) =>
                                  index === scriptIndex ? { ...item, command: event.target.value } : item,
                                ),
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <FieldLabel>Working directory</FieldLabel>
                          <Input
                            value={script.workingDirectory ?? "."}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                setupScripts: current.setupScripts.map((item, index) =>
                                  index === scriptIndex ? { ...item, workingDirectory: event.target.value } : item,
                                ),
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <EnvVarsEditor
                            env={script.env}
                            secretNames={secretNames}
                            onChange={(nextEnv) =>
                              setDraft((current) => ({
                                ...current,
                                setupScripts: current.setupScripts.map((item, index) =>
                                  index === scriptIndex ? { ...item, env: nextEnv } : item,
                                ),
                              }))
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Applications</p>
                <Button variant="outline" size="sm" onClick={addApplication}>
                  <Plus size={14} />
                  Add
                </Button>
              </div>
              {draft.applications.length === 0 ? (
                <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                  No applications.
                </div>
              ) : (
                <div className="space-y-3">
                  {draft.applications.map((application, applicationIndex) => (
                    <ApplicationEditor
                      key={application.id}
                      application={application}
                      secretNames={secretNames}
                      onChange={(nextApplication) =>
                        setDraft((current) => ({
                          ...current,
                          applications: current.applications.map((item, index) =>
                            index === applicationIndex ? nextApplication : item,
                          ),
                        }))
                      }
                      onRemove={() =>
                        setDraft((current) => ({
                          ...current,
                          applications: current.applications.filter((_, index) => index !== applicationIndex),
                        }))
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>

        {formError && <p className="border-t border-border px-5 py-2 text-xs text-destructive">{formError}</p>}
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            <Save size={14} />
            {saving ? "Saving" : "Save configuration"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApplicationEditor({
  application,
  secretNames,
  onChange,
  onRemove,
}: {
  application: DraftApplication;
  secretNames: string[];
  onChange: (application: DraftApplication) => void;
  onRemove: () => void;
}) {
  const addProcess = () => {
    onChange({
      ...application,
      processes: [
        ...application.processes,
        {
          id: uniqueId("process"),
          name: "Process",
          command: "",
          workingDirectory: ".",
          env: [],
          required: false,
          ports: [],
        },
      ],
    });
  };

  return (
    <div className="rounded-md border border-border/70 bg-background/35 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="truncate text-sm font-medium text-foreground">{application.name || "Application"}</p>
        <Button variant="ghost" size="icon-sm" title="Remove application" aria-label="Remove application" onClick={onRemove}>
          <Trash2 size={14} />
        </Button>
      </div>
      <div className="space-y-1">
        <FieldLabel>Name</FieldLabel>
        <Input value={application.name} onChange={(event) => onChange({ ...application, name: event.target.value })} />
      </div>
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">Processes</p>
          <Button variant="outline" size="sm" onClick={addProcess}>
            <Plus size={14} />
            Add process
          </Button>
        </div>
        {application.processes.map((process, processIndex) => (
          <ProcessEditor
            key={process.id}
            process={process}
            secretNames={secretNames}
            onChange={(nextProcess) =>
              onChange({
                ...application,
                processes: application.processes.map((item, index) =>
                  index === processIndex ? nextProcess : item,
                ),
              })
            }
            onRemove={() =>
              onChange({
                ...application,
                processes: application.processes.filter((_, index) => index !== processIndex),
              })
            }
          />
        ))}
      </div>
    </div>
  );
}

function ProcessEditor({
  process,
  secretNames,
  onChange,
  onRemove,
}: {
  process: DraftProcess;
  secretNames: string[];
  onChange: (process: DraftProcess) => void;
  onRemove: () => void;
}) {
  const addPort = () => {
    onChange({
      ...process,
      ports: [
        ...process.ports,
        {
          id: uniqueId("port"),
          label: "Web",
          port: 3000,
          protocol: "http",
          defaultForwardingEnabled: false,
        },
      ],
    });
  };

  return (
    <div className="space-y-3 rounded-md bg-surface-deep/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-medium text-foreground">{process.name || "Process"}</p>
        <Button variant="ghost" size="icon-sm" title="Remove process" aria-label="Remove process" onClick={onRemove}>
          <Trash2 size={14} />
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <FieldLabel>Name</FieldLabel>
          <Input value={process.name} onChange={(event) => onChange({ ...process, name: event.target.value })} />
        </div>
        <div className="space-y-1 md:col-span-2">
          <FieldLabel>Command</FieldLabel>
          <Input value={process.command} onChange={(event) => onChange({ ...process, command: event.target.value })} />
        </div>
        <div className="space-y-1">
          <FieldLabel>Working directory</FieldLabel>
          <Input
            value={process.workingDirectory ?? "."}
            onChange={(event) => onChange({ ...process, workingDirectory: event.target.value })}
          />
        </div>
        <label className="flex h-8 items-center gap-2 self-end rounded-md border border-border/70 px-2.5 text-sm text-foreground">
          <input
            type="checkbox"
            checked={process.required}
            onChange={(event) => onChange({ ...process, required: event.target.checked })}
            className="size-3.5"
          />
          Required
        </label>
        <div className="space-y-1 md:col-span-2">
          <EnvVarsEditor
            env={process.env}
            secretNames={secretNames}
            onChange={(nextEnv) => onChange({ ...process, env: nextEnv })}
          />
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">Ports</p>
          <Button variant="outline" size="sm" onClick={addPort}>
            <Plus size={14} />
            Add port
          </Button>
        </div>
        {process.ports.map((port, portIndex) => (
          <div key={port.id} className="grid gap-2 rounded-md border border-border/60 p-2 md:grid-cols-[1fr_6rem_1fr_auto]">
            <Input
              value={port.label}
              placeholder="Label"
              onChange={(event) =>
                onChange({
                  ...process,
                  ports: process.ports.map((item, index) =>
                    index === portIndex ? { ...item, label: event.target.value } : item,
                  ),
                })
              }
            />
            <Input
              type="number"
              value={port.port}
              onChange={(event) =>
                onChange({
                  ...process,
                  ports: process.ports.map((item, index) =>
                    index === portIndex ? { ...item, port: Number(event.target.value) } : item,
                  ),
                })
              }
            />
            <Input
              value={port.healthPath ?? ""}
              placeholder="/health"
              onChange={(event) =>
                onChange({
                  ...process,
                  ports: process.ports.map((item, index) =>
                    index === portIndex ? { ...item, healthPath: event.target.value } : item,
                  ),
                })
              }
            />
            <div className="flex items-center justify-end gap-1">
              <button
                type="button"
                className={cn(
                  "h-8 rounded-md border px-2 text-xs",
                  port.defaultForwardingEnabled
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground",
                )}
                onClick={() =>
                  onChange({
                    ...process,
                    ports: process.ports.map((item, index) =>
                      index === portIndex
                        ? { ...item, defaultForwardingEnabled: !item.defaultForwardingEnabled }
                        : item,
                    ),
                  })
                }
              >
                Auto
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                title="Remove port"
                aria-label="Remove port"
                onClick={() =>
                  onChange({
                    ...process,
                    ports: process.ports.filter((_, index) => index !== portIndex),
                  })
                }
              >
                <Trash2 size={14} />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
