import { useEffect, useMemo, useState } from "react";
import type {
  RepoApplicationConfig,
  RepoApplicationDefinition,
  RepoProcessDefinition,
} from "@trace/gql";

export type RunScript = {
  applicationId: string;
  processId: string;
  name: string;
  command: string;
};

type DraftConfig = Omit<RepoApplicationConfig, "__typename">;

function cloneConfig(config: RepoApplicationConfig | undefined): DraftConfig {
  return {
    setupScripts: (config?.setupScripts ?? []).map((script) => ({
      id: script.id,
      name: script.name,
      command: script.command,
      workingDirectory: script.workingDirectory,
      env: script.env?.map((entry) => ({
        key: entry.key,
        secretName: entry.secretName,
      })),
    })),
    applications: (config?.applications ?? []).map((application) => ({
      id: application.id,
      name: application.name,
      processes: application.processes.map((process) => ({
        id: process.id,
        name: process.name,
        command: process.command,
        workingDirectory: process.workingDirectory,
        required: process.required,
        env: process.env?.map((entry) => ({
          key: entry.key,
          secretName: entry.secretName,
        })),
        ports: process.ports.map((port) => ({
          id: port.id,
          label: port.label,
          port: port.port,
          protocol: port.protocol,
          defaultForwardingEnabled: port.defaultForwardingEnabled,
          healthPath: port.healthPath,
        })),
      })),
    })),
  };
}

function getRunScripts(config: DraftConfig): RunScript[] {
  return config.applications.flatMap((application) =>
    application.processes.map((process) => ({
      applicationId: application.id,
      processId: process.id,
      name: process.name,
      command: process.command,
    })),
  );
}

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useSessionAutomationDraft({
  open,
  config,
  error,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  config: RepoApplicationConfig | undefined;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (config: RepoApplicationConfig) => Promise<void>;
}) {
  const [draft, setDraft] = useState<DraftConfig>(() => cloneConfig(config));
  const [localError, setLocalError] = useState<string | null>(null);
  const [focusedProcessId, setFocusedProcessId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(cloneConfig(config));
    setLocalError(null);
    setFocusedProcessId(null);
  }, [config, open]);

  const initial = useMemo(() => JSON.stringify(cloneConfig(config)), [config]);
  const dirty = JSON.stringify(draft) !== initial;
  const runScripts = getRunScripts(draft);

  function updateSetupScript(command: string) {
    setDraft((current) => ({
      ...current,
      setupScripts: current.setupScripts.length
        ? current.setupScripts.map((script, index) =>
            index === 0 ? { ...script, command } : script,
          )
        : [{ id: "setup", name: "Setup", command, workingDirectory: ".", env: [] }],
    }));
  }

  function updateRunScript(script: RunScript, field: "name" | "command", value: string) {
    setDraft((current) => ({
      ...current,
      applications: current.applications.map((application) =>
        application.id === script.applicationId
          ? {
              ...application,
              processes: application.processes.map((process) =>
                process.id === script.processId ? { ...process, [field]: value } : process,
              ),
            }
          : application,
      ),
    }));
  }

  function addRunScript() {
    const applicationId = createId("run");
    const processId = createId("command");
    const process: Omit<RepoProcessDefinition, "__typename"> = {
      id: processId,
      name: "",
      command: "",
      workingDirectory: ".",
      env: [],
      required: false,
      ports: [],
    };
    const application: Omit<RepoApplicationDefinition, "__typename"> = {
      id: applicationId,
      name: "Run script",
      processes: [process],
    };
    setDraft((current) => ({
      ...current,
      applications: [...current.applications, application],
    }));
    setFocusedProcessId(processId);
  }

  function removeRunScript(script: RunScript) {
    setDraft((current) => ({
      ...current,
      applications: current.applications.flatMap((application) => {
        if (application.id !== script.applicationId) return [application];
        const processes = application.processes.filter(
          (process) => process.id !== script.processId,
        );
        return processes.length ? [{ ...application, processes }] : [];
      }),
    }));
  }

  async function save() {
    setLocalError(null);
    if (runScripts.some((script) => !script.name.trim() || !script.command.trim())) {
      setLocalError("Run scripts need a name and command.");
      return;
    }
    try {
      await onSave(draft as RepoApplicationConfig);
      onOpenChange(false);
    } catch (saveError) {
      setLocalError(saveError instanceof Error ? saveError.message : "Failed to save automation");
    }
  }

  return {
    addRunScript,
    dirty,
    focusedProcessId,
    formError: localError ?? error,
    removeRunScript,
    runScripts,
    save,
    setupScript: draft.setupScripts[0]?.command ?? "",
    updateRunScript,
    updateSetupScript,
  };
}
