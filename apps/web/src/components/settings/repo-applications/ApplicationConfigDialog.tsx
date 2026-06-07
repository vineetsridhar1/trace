import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import type {
  RepoApplicationConfig,
  RepoApplicationDefinition,
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
import { Textarea } from "../../ui/textarea";

type DraftSetupScript = Omit<RepoSetupScript, "__typename" | "env"> & { envText: string };
type DraftPort = Omit<RepoPortDefinition, "__typename">;
type DraftProcess = Omit<RepoProcessDefinition, "__typename" | "env" | "ports"> & {
  envText: string;
  ports: DraftPort[];
};
type DraftApplication = Omit<RepoApplicationDefinition, "__typename" | "processes"> & {
  processes: DraftProcess[];
};
type DraftConfig = {
  setupScripts: DraftSetupScript[];
  applications: DraftApplication[];
};
type EnvValue = NonNullable<RepoSetupScript["env"]>;

const EMPTY_CONFIG: RepoApplicationConfig = { setupScripts: [], applications: [] };

function envText(env: RepoSetupScript["env"] | RepoProcessDefinition["env"]): string {
  return JSON.stringify(env ?? {}, null, 2);
}

function parseEnv(value: string, label: string): EnvValue {
  const parsed = JSON.parse(value.trim() || "{}") as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} environment must be a JSON object`);
  }
  return parsed as EnvValue;
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
      envText: envText(script.env),
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
        envText: envText(process.env),
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
      env: parseEnv(script.envText, script.name || script.id),
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
        env: parseEnv(process.envText, process.name || process.id),
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
      { id: "install", name: "Install", command: "pnpm install", workingDirectory: ".", env: {} },
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
            env: {},
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

export function ApplicationConfigDialog({
  open,
  config,
  saving,
  error,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  config: RepoApplicationConfig | undefined;
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

  const preview = useMemo(() => {
    try {
      return JSON.stringify(toConfig(draft), null, 2);
    } catch {
      return "";
    }
  }, [draft]);

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
          envText: "{}",
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
      <DialogContent className="max-h-[88dvh] gap-0 overflow-hidden p-0 sm:max-w-5xl" showCloseButton={false}>
        <DialogHeader className="border-b border-border px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle>Application configuration</DialogTitle>
              <DialogDescription>
                Configure setup scripts, managed processes, and preview ports for cloud sessions.
              </DialogDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setDraft(exampleConfig())}>
              Example
            </Button>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-h-0 space-y-5 overflow-auto px-5 py-4">
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
                        <div className="space-y-1">
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
                        <div className="space-y-1">
                          <FieldLabel>ID</FieldLabel>
                          <Input
                            value={script.id}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                setupScripts: current.setupScripts.map((item, index) =>
                                  index === scriptIndex ? { ...item, id: event.target.value } : item,
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
                        <div className="space-y-1">
                          <FieldLabel>Environment JSON</FieldLabel>
                          <Textarea
                            value={script.envText}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                setupScripts: current.setupScripts.map((item, index) =>
                                  index === scriptIndex ? { ...item, envText: event.target.value } : item,
                                ),
                              }))
                            }
                            className="min-h-8 font-mono text-xs"
                            spellCheck={false}
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

          <aside className="hidden min-h-0 border-l border-border bg-surface-deep/60 p-4 lg:block">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-foreground">Preview</p>
              <span className="text-[11px] text-muted-foreground">
                {draft.applications.length} apps / {draft.setupScripts.length} setup
              </span>
            </div>
            <Textarea
              value={preview}
              readOnly
              className="h-[calc(88dvh-12rem)] min-h-0 resize-none font-mono text-[11px]"
              spellCheck={false}
            />
          </aside>
        </div>

        {formError && <p className="border-t border-border px-5 py-2 text-xs text-destructive">{formError}</p>}
        <DialogFooter>
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
  onChange,
  onRemove,
}: {
  application: DraftApplication;
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
          envText: "{}",
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
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <FieldLabel>Name</FieldLabel>
          <Input value={application.name} onChange={(event) => onChange({ ...application, name: event.target.value })} />
        </div>
        <div className="space-y-1">
          <FieldLabel>ID</FieldLabel>
          <Input value={application.id} onChange={(event) => onChange({ ...application, id: event.target.value })} />
        </div>
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
  onChange,
  onRemove,
}: {
  process: DraftProcess;
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
        <div className="space-y-1">
          <FieldLabel>Name</FieldLabel>
          <Input value={process.name} onChange={(event) => onChange({ ...process, name: event.target.value })} />
        </div>
        <div className="space-y-1">
          <FieldLabel>ID</FieldLabel>
          <Input value={process.id} onChange={(event) => onChange({ ...process, id: event.target.value })} />
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
          <FieldLabel>Environment JSON</FieldLabel>
          <Textarea
            value={process.envText}
            onChange={(event) => onChange({ ...process, envText: event.target.value })}
            className="min-h-8 font-mono text-xs"
            spellCheck={false}
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
