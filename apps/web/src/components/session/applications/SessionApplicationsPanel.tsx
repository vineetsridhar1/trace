import { useCallback, useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import { Activity, Copy, ExternalLink, Play, Power, RotateCw, Square, Trash2 } from "lucide-react";
import type {
  EndpointTrafficEntry,
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
import { Button, buttonVariants } from "../../ui/button";

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
            env
          }
          applications {
            id
            name
            processes {
              id
              name
              command
              workingDirectory
              env
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

const TRAFFIC_QUERY = gql`
  query EndpointTrafficPanel($endpointId: ID!, $limit: Int) {
    endpointTraffic(endpointId: $endpointId, limit: $limit) {
      id
      endpointId
      startedAt
      durationMs
      requestMethod
      requestPath
      responseStatus
      error
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

const ROTATE_ENDPOINT_MUTATION = gql`
  mutation RotateSessionEndpoint($endpointId: ID!) {
    rotateSessionEndpoint(endpointId: $endpointId) {
      id
    }
  }
`;

const CLEAR_TRAFFIC_MUTATION = gql`
  mutation ClearEndpointTraffic($endpointId: ID!) {
    clearEndpointTraffic(endpointId: $endpointId)
  }
`;

export function SessionApplicationsPanel({ sessionGroupId }: { sessionGroupId: string }) {
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
  const [activeTab, setActiveTab] = useState<"applications" | "traffic">("applications");
  const [trafficEndpointId, setTrafficEndpointId] = useState<string | null>(null);
  const [trafficEntries, setTrafficEntries] = useState<EndpointTrafficEntry[]>([]);
  const [processLogsById, setProcessLogsById] = useState<Record<string, SessionApplicationLogEntry[]>>({});
  const [setupRuns, setSetupRuns] = useState<SessionSetupScriptRun[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await client
      .query(APPLICATIONS_STATE_QUERY, { sessionGroupId })
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
      .query(PROCESS_LOGS_QUERY, { processId, limit: 8 })
      .toPromise();
    setProcessLogsById((current) => ({
      ...current,
      [processId]: (result.data?.sessionApplicationLogs as SessionApplicationLogEntry[] | undefined) ?? [],
    }));
  }, []);

  useEffect(() => {
    if (!trafficEndpointId) return;
    void client
      .query(TRAFFIC_QUERY, { endpointId: trafficEndpointId, limit: 50 })
      .toPromise()
      .then((result) => {
        setTrafficEntries((result.data?.endpointTraffic as EndpointTrafficEntry[] | undefined) ?? []);
      });
  }, [trafficEndpointId]);

  const processes = useMemo(
    () =>
      Object.values(processTable).filter(
        (process) => process.sessionGroupId === sessionGroupId,
      ),
    [processTable, sessionGroupId],
  );

  useEffect(() => {
    for (const process of processes) {
      if (
        process.status === "exited" ||
        process.status === "failed" ||
        process.lastError
      ) {
        void loadProcessLogs(process.id);
      }
    }
  }, [loadProcessLogs, processes]);

  const endpoints = useMemo(
    () =>
      Object.values(endpointTable).filter(
        (endpoint) => endpoint.sessionGroupId === sessionGroupId,
      ),
    [endpointTable, sessionGroupId],
  );

  const selectedTrafficEndpoint = useMemo(
    () => endpoints.find((endpoint) => endpoint.id === trafficEndpointId) ?? null,
    [endpoints, trafficEndpointId],
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

  useEffect(() => {
    if (activeTab !== "traffic" || trafficEndpointId || endpoints.length === 0) return;
    setTrafficEndpointId(endpoints[0]?.id ?? null);
  }, [activeTab, endpoints, trafficEndpointId]);

  useEffect(() => {
    if (activeTab !== "traffic" || !trafficEndpointId) return;
    const interval = window.setInterval(() => {
      void client
        .query(TRAFFIC_QUERY, { endpointId: trafficEndpointId, limit: 50 })
        .toPromise()
        .then((result) => {
          setTrafficEntries((result.data?.endpointTraffic as EndpointTrafficEntry[] | undefined) ?? []);
        });
    }, 2000);
    return () => window.clearInterval(interval);
  }, [activeTab, trafficEndpointId]);

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

  const showEndpointTraffic = (endpointId: string) => {
    setTrafficEndpointId(endpointId);
    setActiveTab("traffic");
  };

  if (!config || (config.setupScripts.length === 0 && config.applications.length === 0)) {
    return null;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-deep">
      <div className="shrink-0 border-b border-border px-3 py-2">
        <div className="flex items-center justify-between gap-2">
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
        <div className="mt-2 grid grid-cols-2 rounded-md border border-border bg-background/30 p-0.5">
          <button
            type="button"
            className={cn(
              "rounded px-2 py-1 text-xs font-medium transition-colors",
              activeTab === "applications"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setActiveTab("applications")}
          >
            Apps
          </button>
          <button
            type="button"
            className={cn(
              "rounded px-2 py-1 text-xs font-medium transition-colors",
              activeTab === "traffic"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setActiveTab("traffic")}
          >
            Traffic
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-3 py-3">
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {activeTab === "applications" ? (
      <>
      {config.setupScripts.length > 0 && (
        <section className="space-y-1.5">
          <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Setup</p>
          {config.setupScripts.map((script) => {
            const latestRun = latestSetupRunByScript.get(script.id);
            const runOutput = latestRun?.lastError ?? latestRun?.outputPreview;
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
                        <span
                          className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            latestRun.status === "completed"
                              ? "bg-emerald-500"
                              : latestRun.status === "running"
                                ? "bg-amber-500"
                                : "bg-destructive",
                          )}
                        />
                        <span className="truncate text-muted-foreground">
                          {latestRun.status}
                          {latestRun.exitCode != null ? ` ${latestRun.exitCode}` : ""}
                        </span>
                      </div>
                      {latestRun.outputTruncated && <span className="shrink-0 text-muted-foreground">truncated</span>}
                    </div>
                    {runOutput && (
                      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-4 text-foreground">
                        {runOutput.trim()}
                      </pre>
                    )}
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
                          <span className="text-[11px] text-muted-foreground">{process?.status ?? "stopped"}</span>
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
                    {process &&
                      (process.status === "exited" || process.status === "failed" || process.lastError) && (
                        <div className="space-y-1 rounded bg-surface-deep/60 px-2 py-1.5">
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="truncate text-muted-foreground">
                              {process.lastError ?? `Exited${process.exitCode != null ? ` ${process.exitCode}` : ""}`}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              title={`Refresh ${processConfig.name} output`}
                              aria-label={`Refresh ${processConfig.name} output`}
                              onClick={() => void loadProcessLogs(process.id)}
                            >
                              <RotateCw size={12} />
                            </Button>
                          </div>
                          {(processLogsById[process.id] ?? []).slice(-4).map((entry) => (
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
                          ))}
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
                                <a
                                  href={endpointUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block truncate text-[11px] text-primary underline-offset-4 hover:underline"
                                  title={endpointUrl}
                                >
                                  {endpointUrl}
                                </a>
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
                              {endpoint.status}
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
                            <a
                              className={cn(
                                buttonVariants({ variant: "ghost", size: "icon-sm" }),
                                !canOpen && "pointer-events-none opacity-50",
                              )}
                              href={canOpen ? endpointUrl : undefined}
                              target="_blank"
                              rel="noreferrer"
                              title={`Open ${endpoint.label}`}
                              aria-disabled={!canOpen}
                              aria-label={`Open ${endpoint.label}`}
                            >
                              <ExternalLink size={14} />
                            </a>
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
                              title={`Rotate ${endpoint.label} URL`}
                              aria-label={`Rotate ${endpoint.label} URL`}
                              onClick={() =>
                                void run(`rotate:${endpoint.id}`, () =>
                                  client.mutation(ROTATE_ENDPOINT_MUTATION, { endpointId: endpoint.id }).toPromise(),
                                )
                              }
                            >
                              <RotateCw size={14} />
                            </Button>
                            <Button
                              variant={trafficEndpointId === endpoint.id ? "outline" : "ghost"}
                              size="icon-sm"
                              title={`Show ${endpoint.label} traffic`}
                              aria-label={`Show ${endpoint.label} traffic`}
                              onClick={() => showEndpointTraffic(endpoint.id)}
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
      </>
      ) : (
        <section className="space-y-3">
          <div className="space-y-1.5">
            <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Endpoints</p>
            {endpoints.length === 0 ? (
              <p className="rounded-md border border-border/70 bg-background/35 px-3 py-2 text-xs text-muted-foreground">
                No endpoints configured.
              </p>
            ) : (
              <div className="space-y-1.5">
                {endpoints.map((endpoint) => {
                  const endpointUrl = typeof endpoint.url === "string" ? endpoint.url : "";
                  return (
                    <button
                      key={endpoint.id}
                      type="button"
                      className={cn(
                        "w-full rounded-md border px-2.5 py-2 text-left transition-colors",
                        selectedTrafficEndpoint?.id === endpoint.id
                          ? "border-primary/50 bg-primary/10"
                          : "border-border/70 bg-background/35 hover:bg-background/60",
                      )}
                      onClick={() => setTrafficEndpointId(endpoint.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium text-foreground">
                          {endpoint.label}
                          <span className="ml-1 font-normal text-muted-foreground">:{endpoint.targetPort}</span>
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize",
                            endpoint.status === "enabled"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {endpoint.status}
                        </span>
                      </div>
                      <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                        {endpointUrl || "No URL"}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="overflow-hidden rounded-md border border-border/70 bg-background/35">
            <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">
                  {selectedTrafficEndpoint?.label ?? "Traffic"}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {selectedTrafficEndpoint?.url ?? "Select an endpoint to inspect requests"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                title="Clear traffic"
                aria-label="Clear traffic"
                disabled={!trafficEndpointId}
                onClick={() =>
                  trafficEndpointId
                    ? void run(`clear:${trafficEndpointId}`, () =>
                        client.mutation(CLEAR_TRAFFIC_MUTATION, { endpointId: trafficEndpointId }).toPromise(),
                      ).then(() => setTrafficEntries([]))
                    : undefined
                }
              >
                <Trash2 size={14} />
              </Button>
            </div>
            <div className="grid grid-cols-[4.5rem_3.5rem_minmax(0,1fr)_3.25rem_3.5rem] gap-2 border-b border-border/70 bg-surface-deep/70 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <span>Time</span>
              <span>Method</span>
              <span>Path</span>
              <span>Status</span>
              <span className="text-right">Latency</span>
            </div>
            <div className="max-h-[26rem] overflow-auto">
              {trafficEntries.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No traffic captured yet.
                </p>
              ) : (
                trafficEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="grid grid-cols-[4.5rem_3.5rem_minmax(0,1fr)_3.25rem_3.5rem] gap-2 border-b border-border/40 px-3 py-2 text-[11px] last:border-b-0"
                  >
                    <span className="font-mono text-muted-foreground">
                      {new Date(entry.startedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                    <span className="font-mono font-medium text-foreground">{entry.requestMethod}</span>
                    <span className="truncate font-mono text-muted-foreground" title={entry.requestPath}>
                      {entry.requestPath}
                    </span>
                    <span
                      className={cn(
                        "font-mono font-medium",
                        entry.error
                          ? "text-destructive"
                          : entry.responseStatus != null && entry.responseStatus >= 500
                            ? "text-destructive"
                            : entry.responseStatus != null && entry.responseStatus >= 400
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {entry.responseStatus ?? (entry.error ? "ERR" : "...")}
                    </span>
                    <span className="text-right font-mono text-muted-foreground">
                      {entry.durationMs != null ? `${entry.durationMs}ms` : "-"}
                    </span>
                    {entry.error && (
                      <span className="col-span-5 truncate font-mono text-[10px] text-destructive">
                        {entry.error}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      )}
      </div>
    </div>
  );
}
