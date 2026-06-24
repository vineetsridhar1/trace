import { useCallback, useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import {
  Activity,
  ChevronDown,
  Copy,
  ExternalLink,
  Play,
  Power,
  RotateCw,
  Settings,
  Square,
} from "lucide-react";
import type {
  Repo,
  RepoApplicationConfig,
  SessionApplicationLogEntry,
  SessionApplicationProcess,
  SessionEndpoint,
  SessionSetupScriptRun,
} from "@trace/gql";
import { useEntityField, useEntityStore, type SessionGroupEntity } from "@trace/client-core";
import { cn } from "@/lib/utils";
import { client } from "../../../lib/urql";
import { useUIStore } from "../../../stores/ui";
import { Button } from "../../ui/button";
import { TraceLoader } from "../../ui/trace-loader";

const APPLICATIONS_STATE_QUERY = gql`
  query SessionApplicationsState($sessionGroupId: ID!) {
    sessionGroup(id: $sessionGroupId) {
      id
      repo {
        id
        applicationConfig {
          setupScripts {
            id
            name
            command
            workingDirectory
            env {
              key
              secretName
            }
          }
          applications {
            id
            name
            processes {
              id
              name
              command
              workingDirectory
              env {
                key
                secretName
              }
              required
              ports {
                id
                label
                port
                protocol
                defaultForwardingEnabled
                healthPath
              }
            }
          }
        }
      }
    }
    sessionApplicationProcesses(sessionGroupId: $sessionGroupId) {
      id
      sessionGroupId
      appConfigId
      processConfigId
      label
      status
      runtimeInstanceId
      startedAt
      stoppedAt
      exitCode
      lastError
    }
    sessionSetupScriptRuns(sessionGroupId: $sessionGroupId) {
      id
      sessionGroupId
      scriptConfigId
      label
      command
      workingDirectory
      status
      exitCode
      outputPreview
      outputTruncated
      lastError
      startedAt
      completedAt
    }
    sessionEndpoints(sessionGroupId: $sessionGroupId) {
      id
      key
      url
      sessionGroupId
      appConfigId
      processConfigId
      portConfigId
      label
      targetPort
      status
      accessMode
      trafficCaptureMode
      enabledAt
      disabledAt
      revokedAt
    }
  }
`;

const PROCESS_LOGS_QUERY = gql`
  query SessionApplicationProcessLogs($processId: ID!, $limit: Int) {
    sessionApplicationLogs(processId: $processId, limit: $limit) {
      id
      processId
      stream
      data
      sequence
      timestamp
    }
  }
`;

function displayStatus(status: string): string {
  return status.length > 0 ? `${status[0]?.toUpperCase()}${status.slice(1)}` : status;
}

const RUN_SETUP_MUTATION = gql`
  mutation RunSessionGroupSetupScript($sessionGroupId: ID!, $scriptId: ID!) {
    runSessionGroupSetupScript(sessionGroupId: $sessionGroupId, scriptId: $scriptId)
  }
`;

const START_PROCESS_MUTATION = gql`
  mutation StartSessionProcess($sessionGroupId: ID!, $appConfigId: ID!, $processConfigId: ID!) {
    startSessionProcess(
      sessionGroupId: $sessionGroupId
      appConfigId: $appConfigId
      processConfigId: $processConfigId
    ) {
      id
    }
  }
`;

const STOP_PROCESS_MUTATION = gql`
  mutation StopSessionProcess($sessionGroupId: ID!, $appConfigId: ID!, $processConfigId: ID!) {
    stopSessionProcess(
      sessionGroupId: $sessionGroupId
      appConfigId: $appConfigId
      processConfigId: $processConfigId
    ) {
      id
    }
  }
`;

const ENABLE_ENDPOINT_MUTATION = gql`
  mutation EnableSessionEndpointForwarding($endpointId: ID!) {
    enableSessionEndpointForwarding(endpointId: $endpointId, accessMode: public) {
      id
    }
  }
`;

const DISABLE_ENDPOINT_MUTATION = gql`
  mutation DisableSessionEndpointForwarding($endpointId: ID!) {
    disableSessionEndpointForwarding(endpointId: $endpointId) {
      id
    }
  }
`;

export function SessionApplicationsPanel({
  sessionGroupId,
  onOpenTraffic,
}: {
  sessionGroupId: string;
  onOpenTraffic: (endpointId: string) => void;
}) {
  const groupRepo = useEntityField("sessionGroups", sessionGroupId, "repo") as
    | { id: string; applicationConfig?: RepoApplicationConfig | null }
    | null
    | undefined;
  const repoApplicationConfig = useEntityStore((s) =>
    groupRepo?.id ? (s.repos[groupRepo.id]?.applicationConfig as RepoApplicationConfig | null | undefined) : undefined,
  );
  const config = groupRepo?.applicationConfig ?? repoApplicationConfig;
  const upsert = useEntityStore((s) => s.upsert);
  const upsertMany = useEntityStore((s) => s.upsertMany);
  const processTable = useEntityStore((s) => s.sessionApplicationProcesses);
  const endpointTable = useEntityStore((s) => s.sessionEndpoints);
  const setActivePage = useUIStore((s) => s.setActivePage);
  const setSettingsInitialTab = useUIStore((s) => s.setSettingsInitialTab);
  const openBrowserTab = useUIStore((s) => s.openBrowserTab);
  const [processLogsById, setProcessLogsById] = useState<Record<string, SessionApplicationLogEntry[]>>({});
  const [refreshingProcessLogIds, setRefreshingProcessLogIds] = useState<Record<string, boolean>>({});
  const [setupRuns, setSetupRuns] = useState<SessionSetupScriptRun[]>([]);
  const [openSetupLogIds, setOpenSetupLogIds] = useState<Record<string, boolean>>({});
  const [openProcessLogIds, setOpenProcessLogIds] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await client
      .query(APPLICATIONS_STATE_QUERY, { sessionGroupId }, { requestPolicy: "network-only" })
      .toPromise();
    const group = result.data?.sessionGroup as
      | ({ id: string; repo?: { id?: string } | null } & Partial<SessionGroupEntity>)
      | undefined;
    if (group?.id) {
      const existing = useEntityStore.getState().sessionGroups[group.id];
      upsert(
        "sessionGroups",
        group.id,
        (existing ? { ...existing, ...group } : group) as SessionGroupEntity,
      );
    }
    const repo = group?.repo;
    if (repo?.id) {
      const existing = useEntityStore.getState().repos[repo.id];
      upsert("repos", repo.id, (existing ? { ...existing, ...repo } : repo) as Repo);
    }
    if (result.data?.sessionApplicationProcesses) {
      upsertMany(
        "sessionApplicationProcesses",
        result.data.sessionApplicationProcesses as Array<SessionApplicationProcess & { id: string }>,
      );
    }
    setSetupRuns((result.data?.sessionSetupScriptRuns as SessionSetupScriptRun[] | undefined) ?? []);
    if (result.data?.sessionEndpoints) {
      upsertMany("sessionEndpoints", result.data.sessionEndpoints as Array<SessionEndpoint & { id: string }>);
    }
  }, [sessionGroupId, upsert, upsertMany]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadProcessLogs = useCallback(async (processId: string) => {
    const result = await client
      .query(PROCESS_LOGS_QUERY, { processId, limit: 50 }, { requestPolicy: "network-only" })
      .toPromise();
    if (result.error) {
      throw new Error(result.error.message);
    }
    setProcessLogsById((current) => ({
      ...current,
      [processId]: (result.data?.sessionApplicationLogs as SessionApplicationLogEntry[] | undefined) ?? [],
    }));
  }, []);

  const refreshProcessLogs = useCallback(async (processId: string) => {
    setRefreshingProcessLogIds((current) => ({ ...current, [processId]: true }));
    setError(null);
    try {
      await loadProcessLogs(processId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshingProcessLogIds((current) => ({ ...current, [processId]: false }));
    }
  }, [loadProcessLogs]);

  const processes = useMemo(
    () =>
      Object.values(processTable).filter(
        (process) => process.sessionGroupId === sessionGroupId,
      ),
    [processTable, sessionGroupId],
  );

  useEffect(() => {
    for (const process of processes) {
      void loadProcessLogs(process.id).catch(() => undefined);
    }
  }, [loadProcessLogs, processes]);

  useEffect(() => {
    const activeProcesses = processes.filter(
      (process) =>
        process.status === "starting" ||
        process.status === "running" ||
        process.status === "stopping",
    );
    if (activeProcesses.length === 0) return;
    const interval = window.setInterval(() => {
      void refresh();
      for (const process of activeProcesses) {
        void loadProcessLogs(process.id).catch(() => undefined);
      }
    }, 1500);
    return () => window.clearInterval(interval);
  }, [loadProcessLogs, processes, refresh]);

  const endpoints = useMemo(
    () =>
      Object.values(endpointTable).filter(
        (endpoint) => endpoint.sessionGroupId === sessionGroupId,
      ),
    [endpointTable, sessionGroupId],
  );

  const processesByKey = useMemo(() => {
    const map = new Map<string, SessionApplicationProcess>();
    for (const process of processes) {
      map.set(`${process.appConfigId}:${process.processConfigId}`, process);
    }
    return map;
  }, [processes]);

  const endpointsByProcess = useMemo(() => {
    const map = new Map<string, SessionEndpoint[]>();
    for (const endpoint of endpoints) {
      const key = `${endpoint.appConfigId}:${endpoint.processConfigId}`;
      map.set(key, [...(map.get(key) ?? []), endpoint]);
    }
    return map;
  }, [endpoints]);

  const latestSetupRunByScript = useMemo(() => {
    const map = new Map<string, SessionSetupScriptRun>();
    for (const run of setupRuns) {
      const existing = map.get(run.scriptConfigId);
      if (!existing || run.startedAt > existing.startedAt) {
        map.set(run.scriptConfigId, run);
      }
    }
    return map;
  }, [setupRuns]);

  useEffect(() => {
    if (!setupRuns.some((run) => run.status === "running")) return;
    const interval = window.setInterval(() => {
      void refresh();
    }, 1500);
    return () => window.clearInterval(interval);
  }, [refresh, setupRuns]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setPending(key);
    setError(null);
    try {
      const result = await fn();
      const operationError =
        result && typeof result === "object" && "error" in result
          ? (result.error as { message?: string } | undefined)
          : undefined;
      if (operationError) {
        throw new Error(operationError.message ?? "Application action failed");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(null);
    }
  };

  const copyEndpointUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setError(null);
    } catch {
      setError(url);
    }
  };

  const toggleSetupLogs = (scriptId: string) => {
    setOpenSetupLogIds((current) => ({ ...current, [scriptId]: !current[scriptId] }));
  };

  const toggleProcessLogs = (processId: string) => {
    setOpenProcessLogIds((current) => ({ ...current, [processId]: !current[processId] }));
  };

  if (!config || (config.setupScripts.length === 0 && config.applications.length === 0)) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-surface-deep">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-semibold text-foreground">Applications</p>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-6">
          <div className="max-w-64 text-center">
            <Settings size={22} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No applications configured</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Configure repository setup scripts, processes, and ports in settings.
            </p>
            <Button
              type="button"
              size="sm"
              className="mt-4"
              onClick={() => {
                setSettingsInitialTab("repositories");
                setActivePage("settings");
              }}
            >
              <Settings size={14} className="mr-1.5" />
              Configure in settings
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-deep">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <p className="text-sm font-semibold text-foreground">Applications</p>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Refresh applications"
          aria-label="Refresh applications"
          onClick={() => void refresh()}
        >
          <RotateCw size={14} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-3 py-3">
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {config.setupScripts.length > 0 && (
        <section className="space-y-1.5">
          <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Setup</p>
          {config.setupScripts.map((script) => {
            const latestRun = latestSetupRunByScript.get(script.id);
            const runOutput = latestRun?.lastError ?? latestRun?.outputPreview;
            const logsOpen = !!openSetupLogIds[script.id];
            return (
              <div
                key={script.id}
                className="space-y-2 rounded-md border border-border/70 bg-background/35 px-2.5 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{script.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{script.command}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    title={`Run ${script.name}`}
                    aria-label={`Run ${script.name}`}
                    disabled={pending === script.id || latestRun?.status === "running"}
                    onClick={() =>
                      void run(script.id, () =>
                        client.mutation(RUN_SETUP_MUTATION, { sessionGroupId, scriptId: script.id }).toPromise(),
                      )
                    }
                  >
                    <Play size={14} />
                  </Button>
                </div>
                {latestRun && (
                  <div className="space-y-1 rounded bg-surface-deep/60 px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <div className="flex min-w-0 items-center gap-1.5">
                        {latestRun.status === "running" ? (
                          <TraceLoader size={12} showLabel={false} className="shrink-0" />
                        ) : (
                          <span
                            className={cn(
                              "size-1.5 shrink-0 rounded-full",
                              latestRun.status === "completed"
                                ? "bg-emerald-500"
                                : "bg-destructive",
                            )}
                          />
                        )}
                        <span className="truncate text-muted-foreground">
                          {displayStatus(latestRun.status)}
                          {latestRun.exitCode != null && latestRun.exitCode !== 0
                            ? ` ${latestRun.exitCode}`
                            : ""}
                        </span>
                      </div>
                      {latestRun.outputTruncated && <span className="shrink-0 text-muted-foreground">truncated</span>}
                    </div>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded px-1 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-background/40 hover:text-foreground"
                      onClick={() => toggleSetupLogs(script.id)}
                    >
                      <span>{logsOpen ? "Hide logs" : "View logs"}</span>
                      <ChevronDown
                        size={12}
                        className={cn(
                          "transition-transform duration-200",
                          logsOpen ? "rotate-180" : undefined,
                        )}
                      />
                    </button>
                    <div
                      className={cn(
                        "grid transition-[grid-template-rows] duration-200 ease-out",
                        logsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                      )}
                    >
                      <div className="min-h-0 overflow-hidden">
                        <pre
                          className={cn(
                            "max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-background/40 px-2 py-1.5 font-mono text-[11px] leading-4 text-foreground",
                            !runOutput && "text-muted-foreground",
                          )}
                        >
                          {(runOutput || "No logs yet.").trim()}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}
      <div className="space-y-4">
        {config.applications.map((application) => (
          <section key={application.id} className="space-y-2">
            <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {application.name}
            </p>
            <div className="space-y-2">
              {application.processes.map((processConfig) => {
                const process = processesByKey.get(`${application.id}:${processConfig.id}`);
                const processEndpoints = endpointsByProcess.get(`${application.id}:${processConfig.id}`) ?? [];
                const processLogEntries = process ? (processLogsById[process.id] ?? []) : [];
                const processLogsOpen = process ? !!openProcessLogIds[process.id] : false;
                const processLogsRefreshing = process ? !!refreshingProcessLogIds[process.id] : false;
                const running = process?.status === "running";
                const active = running || process?.status === "starting" || process?.status === "stopping";
                return (
                  <div
                    key={processConfig.id}
                    className="space-y-2 rounded-md border border-border/70 bg-background/35 px-2.5 py-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{processConfig.name}</p>
                        <div className="mt-1 flex items-center gap-1.5">
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              running
                                ? "bg-emerald-500"
                                : process?.status === "starting" || process?.status === "stopping"
                                  ? "bg-amber-500"
                                  : "bg-muted-foreground/40",
                            )}
                          />
                          <span className="text-[11px] text-muted-foreground">
                            {displayStatus(process?.status ?? "stopped")}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant={active ? "ghost" : "outline"}
                        size="icon-sm"
                        title={active ? `Stop ${processConfig.name}` : `Start ${processConfig.name}`}
                        aria-label={active ? `Stop ${processConfig.name}` : `Start ${processConfig.name}`}
                        disabled={pending === `${application.id}:${processConfig.id}`}
                        onClick={() =>
                          void run(`${application.id}:${processConfig.id}`, () =>
                            client
                              .mutation(active ? STOP_PROCESS_MUTATION : START_PROCESS_MUTATION, {
                                sessionGroupId,
                                appConfigId: application.id,
                                processConfigId: processConfig.id,
                              })
                              .toPromise(),
                          )
                        }
                      >
                        {active ? <Square size={14} /> : <Play size={14} />}
                      </Button>
                    </div>
                    {process && (
                      <div className="overflow-hidden rounded bg-surface-deep/60">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center justify-between gap-2 px-2 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-background/40 hover:text-foreground"
                            onClick={() => toggleProcessLogs(process.id)}
                          >
                            <span className="truncate">
                              {process.lastError ??
                                (process.exitCode != null
                                  ? `Exited ${process.exitCode}`
                                  : processLogsOpen
                                    ? "Hide logs"
                                    : "View logs")}
                            </span>
                            <ChevronDown
                              size={12}
                              className={cn(
                                "shrink-0 transition-transform duration-200",
                                processLogsOpen ? "rotate-180" : undefined,
                              )}
                            />
                          </button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            title={`Refresh ${processConfig.name} logs`}
                            aria-label={`Refresh ${processConfig.name} logs`}
                            className="mr-1 shrink-0"
                            disabled={processLogsRefreshing}
                            onClick={(event) => {
                              event.stopPropagation();
                              void refreshProcessLogs(process.id);
                            }}
                          >
                            <RotateCw
                              size={12}
                              className={cn(processLogsRefreshing && "animate-spin")}
                            />
                          </Button>
                        </div>
                        <div
                          className={cn(
                            "grid transition-[grid-template-rows] duration-200 ease-out",
                            processLogsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                          )}
                        >
                          <div className="min-h-0 overflow-hidden">
                            <div className="max-h-44 space-y-1 overflow-auto border-t border-border/60 bg-background/40 px-2 py-1.5">
                              {processLogEntries.length === 0 ? (
                                <p className="text-[11px] text-muted-foreground">No logs yet.</p>
                              ) : (
                                processLogEntries.slice(-16).map((entry) => (
                                  <div
                                    key={entry.id}
                                    className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-2 text-[11px] leading-4"
                                  >
                                    <span
                                      className={cn(
                                        "font-mono",
                                        entry.stream === "stderr" ? "text-destructive" : "text-muted-foreground",
                                      )}
                                    >
                                      {entry.stream}
                                    </span>
                                    <span className="whitespace-pre-wrap break-words font-mono text-foreground">
                                      {entry.data.trim() || "(empty)"}
                                    </span>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    {processEndpoints.map((endpoint) => {
                      const endpointUrl = typeof endpoint.url === "string" ? endpoint.url : "";
                      const endpointEnabled = endpoint.status === "enabled";
                      const canOpen = endpointEnabled && endpointUrl.length > 0;
                      return (
                        <div key={endpoint.id} className="space-y-2 border-t border-border/70 pt-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-foreground">
                                {endpoint.label}
                                <span className="ml-1 font-normal text-muted-foreground">:{endpoint.targetPort}</span>
                              </p>
                              {endpointEnabled && endpointUrl ? (
                                <button
                                  type="button"
                                  onClick={() => openBrowserTab(endpointUrl, endpoint.label)}
                                  className="block w-full truncate text-left text-[11px] text-primary underline-offset-4 hover:underline"
                                  title={endpointUrl}
                                >
                                  {endpointUrl}
                                </button>
                              ) : (
                                <p className="text-[11px] text-muted-foreground">Forwarding disabled</p>
                              )}
                            </div>
                            <span
                              className={cn(
                                "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize",
                                endpointEnabled
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : "bg-muted text-muted-foreground",
                              )}
                            >
                              {displayStatus(endpoint.status)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant={endpointEnabled ? "ghost" : "outline"}
                              size="icon-sm"
                              title={endpointEnabled ? `Disable ${endpoint.label}` : `Enable ${endpoint.label}`}
                              aria-label={endpointEnabled ? `Disable ${endpoint.label}` : `Enable ${endpoint.label}`}
                              disabled={
                                pending === endpoint.id ||
                                (!endpointEnabled && !running)
                              }
                              onClick={() =>
                                void run(endpoint.id, async () => {
                                  if (!endpointEnabled) {
                                    await refresh();
                                  }
                                  return client
                                    .mutation(
                                      endpointEnabled
                                        ? DISABLE_ENDPOINT_MUTATION
                                        : ENABLE_ENDPOINT_MUTATION,
                                      { endpointId: endpoint.id },
                                    )
                                    .toPromise();
                                })
                              }
                            >
                              {endpointEnabled ? <Square size={14} /> : <Power size={14} />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={!canOpen}
                              onClick={() => openBrowserTab(endpointUrl, endpoint.label)}
                              title={`Open ${endpoint.label}`}
                              aria-label={`Open ${endpoint.label}`}
                            >
                              <ExternalLink size={14} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title={`Copy ${endpoint.label} URL`}
                              aria-label={`Copy ${endpoint.label} URL`}
                              disabled={!endpointUrl}
                              onClick={() => void copyEndpointUrl(endpointUrl)}
                            >
                              <Copy size={14} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title={`Show ${endpoint.label} traffic`}
                              aria-label={`Show ${endpoint.label} traffic`}
                              onClick={() => onOpenTraffic(endpoint.id)}
                            >
                              <Activity size={14} />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      </div>
    </div>
  );
}
