import { useCallback, useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import { ExternalLink, Play, RotateCw, Square, Trash2 } from "lucide-react";
import type {
  EndpointTrafficEntry,
  RepoApplicationConfig,
  SessionApplicationProcess,
  SessionEndpoint,
} from "@trace/gql";
import { useEntityField, useEntityStore } from "@trace/client-core";
import { client } from "../../../lib/urql";
import { Button } from "../../ui/button";

const APPLICATIONS_STATE_QUERY = gql`
  query SessionApplicationsState($sessionGroupId: ID!) {
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
  const config = groupRepo?.applicationConfig;
  const upsertMany = useEntityStore((s) => s.upsertMany);
  const processes = useEntityStore((s) =>
    Object.values(s.sessionApplicationProcesses).filter((process) => process.sessionGroupId === sessionGroupId),
  );
  const endpoints = useEntityStore((s) =>
    Object.values(s.sessionEndpoints).filter((endpoint) => endpoint.sessionGroupId === sessionGroupId),
  );
  const [trafficEndpointId, setTrafficEndpointId] = useState<string | null>(null);
  const [trafficEntries, setTrafficEntries] = useState<EndpointTrafficEntry[]>([]);
  const [pending, setPending] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await client
      .query(APPLICATIONS_STATE_QUERY, { sessionGroupId })
      .toPromise();
    if (result.data?.sessionApplicationProcesses) {
      upsertMany(
        "sessionApplicationProcesses",
        result.data.sessionApplicationProcesses as Array<SessionApplicationProcess & { id: string }>,
      );
    }
    if (result.data?.sessionEndpoints) {
      upsertMany("sessionEndpoints", result.data.sessionEndpoints as Array<SessionEndpoint & { id: string }>);
    }
  }, [sessionGroupId, upsertMany]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!trafficEndpointId) return;
    void client
      .query(TRAFFIC_QUERY, { endpointId: trafficEndpointId, limit: 50 })
      .toPromise()
      .then((result) => {
        setTrafficEntries((result.data?.endpointTraffic as EndpointTrafficEntry[] | undefined) ?? []);
      });
  }, [trafficEndpointId]);

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

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setPending(key);
    try {
      await fn();
      await refresh();
    } finally {
      setPending(null);
    }
  };

  if (!config || (config.setupScripts.length === 0 && config.applications.length === 0)) {
    return null;
  }

  return (
    <div className="max-h-[38vh] overflow-auto border-t border-border bg-surface-deep px-4 py-3">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Applications</p>
        <Button variant="ghost" size="sm" onClick={() => void refresh()}>
          <RotateCw size={14} />
          Refresh
        </Button>
      </div>
      {config.setupScripts.length > 0 && (
        <div className="mb-3 space-y-1">
          {config.setupScripts.map((script) => (
            <div key={script.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-muted-foreground">{script.name}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={pending === script.id}
                onClick={() =>
                  void run(script.id, () =>
                    client.mutation(RUN_SETUP_MUTATION, { sessionGroupId, scriptId: script.id }).toPromise(),
                  )
                }
              >
                <Play size={14} />
                Run
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-3">
        {config.applications.map((application) => (
          <div key={application.id} className="rounded-md border border-border bg-background/40 p-3">
            <p className="mb-2 text-sm font-medium text-foreground">{application.name}</p>
            <div className="space-y-2">
              {application.processes.map((processConfig) => {
                const process = processesByKey.get(`${application.id}:${processConfig.id}`);
                const processEndpoints = endpointsByProcess.get(`${application.id}:${processConfig.id}`) ?? [];
                const running = process?.status === "running" || process?.status === "starting";
                return (
                  <div key={processConfig.id} className="space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate text-foreground">{processConfig.name}</p>
                        <p className="text-xs text-muted-foreground">{process?.status ?? "stopped"}</p>
                      </div>
                      <Button
                        variant={running ? "ghost" : "outline"}
                        size="sm"
                        disabled={pending === `${application.id}:${processConfig.id}`}
                        onClick={() =>
                          void run(`${application.id}:${processConfig.id}`, () =>
                            client
                              .mutation(running ? STOP_PROCESS_MUTATION : START_PROCESS_MUTATION, {
                                sessionGroupId,
                                appConfigId: application.id,
                                processConfigId: processConfig.id,
                              })
                              .toPromise(),
                          )
                        }
                      >
                        {running ? <Square size={14} /> : <Play size={14} />}
                        {running ? "Stop" : "Start"}
                      </Button>
                    </div>
                    {processEndpoints.map((endpoint) => (
                      <div key={endpoint.id} className="flex flex-wrap items-center gap-2 pl-3 text-xs">
                        <span className="text-muted-foreground">
                          {endpoint.label} :{endpoint.targetPort} {endpoint.status}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            void run(endpoint.id, () =>
                              client
                                .mutation(
                                  endpoint.status === "enabled"
                                    ? DISABLE_ENDPOINT_MUTATION
                                    : ENABLE_ENDPOINT_MUTATION,
                                  { endpointId: endpoint.id },
                                )
                                .toPromise(),
                            )
                          }
                        >
                          {endpoint.status === "enabled" ? "Disable" : "Enable"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => window.open(endpoint.url, "_blank")}>
                          <ExternalLink size={14} />
                          Open
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            void run(`rotate:${endpoint.id}`, () =>
                              client.mutation(ROTATE_ENDPOINT_MUTATION, { endpointId: endpoint.id }).toPromise(),
                            )
                          }
                        >
                          Rotate
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setTrafficEndpointId(endpoint.id)}>
                          Traffic
                        </Button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {trafficEndpointId && (
        <div className="mt-3 rounded-md border border-border bg-background/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-foreground">Traffic</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                void run(`clear:${trafficEndpointId}`, () =>
                  client.mutation(CLEAR_TRAFFIC_MUTATION, { endpointId: trafficEndpointId }).toPromise(),
                ).then(() => setTrafficEntries([]))
              }
            >
              <Trash2 size={14} />
              Clear
            </Button>
          </div>
          <div className="space-y-1">
            {trafficEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground">No traffic captured yet.</p>
            ) : (
              trafficEntries.map((entry) => (
                <div key={entry.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono text-foreground">{entry.requestMethod}</span>
                  <span className="truncate">{entry.requestPath}</span>
                  <span>{entry.responseStatus ?? entry.error ?? "pending"}</span>
                  {entry.durationMs != null && <span>{entry.durationMs}ms</span>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
