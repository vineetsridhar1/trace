import { useEffect, useMemo, useState } from "react";
import type {
  RepoApplicationConfig,
  RepoApplicationDefinition,
  RepoEnvVar,
  RepoPortDefinition,
  RepoProcessDefinition,
  RepoRunScript,
  RepoSetupScript,
} from "@trace/gql";

export type AutomationSection = "setup" | "run" | "apps";
type ValidationIssue = { section: AutomationSection; message: string };
export type EnvTarget =
  | { type: "setup"; scriptId: string }
  | { type: "process"; applicationId: string; processId: string };

function cloneConfig(config: RepoApplicationConfig | undefined): RepoApplicationConfig {
  return {
    setupScripts: (config?.setupScripts ?? []).map((script) => ({
      ...script,
      env: script.env.map((entry) => ({ ...entry })),
    })),
    runScripts: (config?.runScripts ?? []).map((script) => ({ ...script })),
    applications: (config?.applications ?? []).map((application) => ({
      ...application,
      processes: application.processes.map((process) => ({
        ...process,
        env: process.env.map((entry) => ({ ...entry })),
        ports: process.ports.map((port) => ({ ...port })),
      })),
    })),
  };
}

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useSessionAutomationDraft({
  open,
  config,
  error,
  secretNames,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  config: RepoApplicationConfig | undefined;
  error: string | null;
  secretNames: string[];
  onOpenChange: (open: boolean) => void;
  onSave: (config: RepoApplicationConfig) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => cloneConfig(config));
  const [activeSection, setActiveSection] = useState<AutomationSection>("setup");
  const [expandedProcessId, setExpandedProcessId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const next = cloneConfig(config);
    setDraft(next);
    setActiveSection("setup");
    setExpandedProcessId(next.applications[0]?.processes[0]?.id ?? null);
    setLocalError(null);
  }, [config, open]);

  const initial = useMemo(() => JSON.stringify(cloneConfig(config)), [config]);
  const dirty = JSON.stringify(draft) !== initial;
  const validationIssues = validateDraft(draft, secretNames);
  const issues = validationIssues.map((issue) => issue.message);

  function updateSetupScript(id: string, patch: Partial<RepoSetupScript>) {
    setDraft((current) => ({
      ...current,
      setupScripts: current.setupScripts.map((script) =>
        script.id === id ? { ...script, ...patch } : script,
      ),
    }));
  }

  function addSetupScript() {
    const script: RepoSetupScript = {
      id: createId("setup"),
      name: "",
      command: "",
      workingDirectory: ".",
      env: [],
    };
    setDraft((current) => ({ ...current, setupScripts: [...current.setupScripts, script] }));
  }

  function removeSetupScript(id: string) {
    setDraft((current) => ({
      ...current,
      setupScripts: current.setupScripts.filter((script) => script.id !== id),
    }));
  }

  function updateRunScript(id: string, patch: Partial<RepoRunScript>) {
    setDraft((current) => ({
      ...current,
      runScripts: current.runScripts.map((script) =>
        script.id === id ? { ...script, ...patch } : script,
      ),
    }));
  }

  function addRunScript() {
    if (draft.runScripts.length >= 10) return;
    const script: RepoRunScript = { id: createId("run"), name: "", command: "" };
    setDraft((current) => ({ ...current, runScripts: [...current.runScripts, script] }));
  }

  function removeRunScript(id: string) {
    setDraft((current) => ({
      ...current,
      runScripts: current.runScripts.filter((script) => script.id !== id),
    }));
  }

  function updateApplication(id: string, patch: Partial<RepoApplicationDefinition>) {
    setDraft((current) => ({
      ...current,
      applications: current.applications.map((application) =>
        application.id === id ? { ...application, ...patch } : application,
      ),
    }));
  }

  function addApplication() {
    const application: RepoApplicationDefinition = {
      id: createId("app"),
      name: "",
      processes: [],
    };
    setDraft((current) => ({
      ...current,
      applications: [...current.applications, application],
    }));
  }

  function removeApplication(id: string) {
    setDraft((current) => ({
      ...current,
      applications: current.applications.filter((application) => application.id !== id),
    }));
  }

  function updateProcess(
    applicationId: string,
    processId: string,
    patch: Partial<RepoProcessDefinition>,
  ) {
    setDraft((current) => ({
      ...current,
      applications: current.applications.map((application) =>
        application.id === applicationId
          ? {
              ...application,
              processes: application.processes.map((process) =>
                process.id === processId ? { ...process, ...patch } : process,
              ),
            }
          : application,
      ),
    }));
  }

  function addProcess(applicationId: string) {
    const process: RepoProcessDefinition = {
      id: createId("process"),
      name: "",
      command: "",
      workingDirectory: ".",
      env: [],
      required: true,
      ports: [],
    };
    updateApplicationProcesses(applicationId, (processes) => [...processes, process]);
    setExpandedProcessId(process.id);
  }

  function removeProcess(applicationId: string, processId: string) {
    updateApplicationProcesses(applicationId, (processes) =>
      processes.filter((process) => process.id !== processId),
    );
    if (expandedProcessId === processId) setExpandedProcessId(null);
  }

  function updateApplicationProcesses(
    applicationId: string,
    update: (processes: RepoProcessDefinition[]) => RepoProcessDefinition[],
  ) {
    setDraft((current) => ({
      ...current,
      applications: current.applications.map((application) =>
        application.id === applicationId
          ? { ...application, processes: update(application.processes) }
          : application,
      ),
    }));
  }

  function addPort(applicationId: string, processId: string) {
    const port: RepoPortDefinition = {
      id: createId("port"),
      label: "",
      port: 3000,
      protocol: "http",
      defaultForwardingEnabled: true,
      healthPath: "/",
    };
    updateProcessPorts(applicationId, processId, (ports) => [...ports, port]);
  }

  function updatePort(
    applicationId: string,
    processId: string,
    portId: string,
    patch: Partial<RepoPortDefinition>,
  ) {
    updateProcessPorts(applicationId, processId, (ports) =>
      ports.map((port) => (port.id === portId ? { ...port, ...patch } : port)),
    );
  }

  function removePort(applicationId: string, processId: string, portId: string) {
    updateProcessPorts(applicationId, processId, (ports) =>
      ports.filter((port) => port.id !== portId),
    );
  }

  function updateProcessPorts(
    applicationId: string,
    processId: string,
    update: (ports: RepoPortDefinition[]) => RepoPortDefinition[],
  ) {
    setDraft((current) => ({
      ...current,
      applications: current.applications.map((application) =>
        application.id === applicationId
          ? {
              ...application,
              processes: application.processes.map((process) =>
                process.id === processId ? { ...process, ports: update(process.ports) } : process,
              ),
            }
          : application,
      ),
    }));
  }

  function updateEnv(target: EnvTarget, update: (env: RepoEnvVar[]) => RepoEnvVar[]) {
    if (target.type === "setup") {
      setDraft((current) => ({
        ...current,
        setupScripts: current.setupScripts.map((script) =>
          script.id === target.scriptId ? { ...script, env: update(script.env) } : script,
        ),
      }));
      return;
    }
    setDraft((current) => ({
      ...current,
      applications: current.applications.map((application) =>
        application.id === target.applicationId
          ? {
              ...application,
              processes: application.processes.map((process) =>
                process.id === target.processId
                  ? { ...process, env: update(process.env) }
                  : process,
              ),
            }
          : application,
      ),
    }));
  }

  function addEnv(target: EnvTarget) {
    updateEnv(target, (env) => [...env, { key: "", secretName: "" }]);
  }

  function updateEnvEntry(target: EnvTarget, index: number, patch: Partial<RepoEnvVar>) {
    updateEnv(target, (env) =>
      env.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)),
    );
  }

  function removeEnvEntry(target: EnvTarget, index: number) {
    updateEnv(target, (env) => env.filter((_, entryIndex) => entryIndex !== index));
  }

  async function save() {
    setLocalError(null);
    if (issues.length) {
      setLocalError(issues[0]);
      return;
    }
    try {
      await onSave(draft);
      onOpenChange(false);
    } catch (saveError) {
      setLocalError(saveError instanceof Error ? saveError.message : "Failed to save automation");
    }
  }

  return {
    activeSection,
    addApplication,
    addEnv,
    addPort,
    addProcess,
    addRunScript,
    addSetupScript,
    dirty,
    draft,
    expandedProcessId,
    formError: localError ?? error,
    issues,
    issueSection: validationIssues[0]?.section ?? null,
    issueSections: [...new Set(validationIssues.map((issue) => issue.section))],
    removeApplication,
    removeEnvEntry,
    removePort,
    removeProcess,
    removeRunScript,
    removeSetupScript,
    save,
    setActiveSection,
    setExpandedProcessId,
    updateApplication,
    updateEnvEntry,
    updatePort,
    updateProcess,
    updateRunScript,
    updateSetupScript,
  };
}

function validateDraft(config: RepoApplicationConfig, secretNames: string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const addIssue = (section: AutomationSection, message: string) => {
    if (!issues.some((issue) => issue.section === section && issue.message === message)) {
      issues.push({ section, message });
    }
  };
  const validateEnv = (section: AutomationSection, env: RepoEnvVar[]) => {
    for (const entry of env) {
      if (!entry.key.trim()) addIssue(section, "Environment variables need a name.");
      else if (!entry.secretName) addIssue(section, `${entry.key} needs a workspace secret.`);
      else if (!secretNames.includes(entry.secretName)) {
        addIssue(section, `${entry.key} points to a removed workspace secret.`);
      }
    }
  };
  for (const script of config.setupScripts) {
    if (!script.name.trim() || !script.command.trim()) {
      addIssue("setup", "Setup steps need a name and command.");
    }
    validateEnv("setup", script.env);
  }
  for (const script of config.runScripts) {
    if (!script.name.trim() || !script.command.trim()) {
      addIssue("run", "Run scripts need a name and command.");
    }
  }
  if (config.runScripts.length > 10) {
    addIssue("run", "Run scripts cannot exceed 10 entries.");
  }
  for (const application of config.applications) {
    if (!application.name.trim()) addIssue("apps", "Applications need a name.");
    for (const process of application.processes) {
      if (!process.name.trim() || !process.command.trim()) {
        addIssue("apps", "Processes need a name and command.");
      }
      validateEnv("apps", process.env);
      for (const port of process.ports) {
        if (!port.label.trim() || port.port < 1024 || port.port > 65535) {
          addIssue("apps", "Ports need a label and a number from 1024 to 65535.");
        }
      }
    }
  }
  return issues;
}
