import { useCallback, useEffect, useMemo } from "react";
import type {
  RepoApplicationConfig,
  SessionApplicationLogEntry,
  SessionApplicationProcess,
  SessionEndpoint,
  SessionSetupScriptRun,
} from "@trace/gql";
import { useEntityField, useEntityStore, type SessionGroupEntity } from "@trace/client-core";
import { client } from "../../../lib/urql";
import {
  APPLICATIONS_STATE_QUERY,
  DEFAULT_APP_CONFIG,
  PROCESS_LOGS_QUERY,
} from "./session-applications-operations";

function hasContent(
  config: RepoApplicationConfig | null | undefined,
): config is RepoApplicationConfig {
  return Boolean(config && (config.applications.length > 0 || config.setupScripts.length > 0));
}

export function useSessionApplicationsData(sessionGroupId: string) {
  const groupRepo = useEntityField("sessionGroups", sessionGroupId, "repo") as
    | { id: string; applicationConfig?: RepoApplicationConfig | null }
    | null
    | undefined;
  const groupKind = useEntityField("sessionGroups", sessionGroupId, "kind") as
    | string
    | null
    | undefined;
  const repoConfig = useEntityStore((state) =>
    groupRepo?.id
      ? (state.repos[groupRepo.id]?.applicationConfig as RepoApplicationConfig | null | undefined)
      : undefined,
  );
  const resolvedConfig = groupRepo?.applicationConfig ?? repoConfig;
  const config = hasContent(resolvedConfig)
    ? resolvedConfig
    : groupKind === "app"
      ? DEFAULT_APP_CONFIG
      : resolvedConfig;
  const upsert = useEntityStore((state) => state.upsert);
  const upsertMany = useEntityStore((state) => state.upsertMany);
  const processTable = useEntityStore((state) => state.sessionApplicationProcesses);
  const processLogTable = useEntityStore((state) => state.sessionApplicationLogs);
  const endpointTable = useEntityStore((state) => state.sessionEndpoints);
  const setupRunTable = useEntityStore((state) => state.sessionSetupScriptRuns);

  const refresh = useCallback(async () => {
    const result = await client
      .query(APPLICATIONS_STATE_QUERY, { sessionGroupId }, { requestPolicy: "network-only" })
      .toPromise();
    if (result.error) throw new Error(result.error.message);
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
    if (result.data?.sessionApplicationProcesses) {
      upsertMany(
        "sessionApplicationProcesses",
        result.data.sessionApplicationProcesses as Array<
          SessionApplicationProcess & { id: string }
        >,
      );
    }
    if (result.data?.sessionSetupScriptRuns) {
      upsertMany(
        "sessionSetupScriptRuns",
        result.data.sessionSetupScriptRuns as Array<SessionSetupScriptRun & { id: string }>,
      );
    }
    if (result.data?.sessionEndpoints) {
      upsertMany(
        "sessionEndpoints",
        result.data.sessionEndpoints as Array<SessionEndpoint & { id: string }>,
      );
    }
  }, [sessionGroupId, upsert, upsertMany]);

  const loadProcessLogs = useCallback(async (processId: string) => {
    const result = await client
      .query(PROCESS_LOGS_QUERY, { processId, limit: 50 }, { requestPolicy: "network-only" })
      .toPromise();
    if (result.error) throw new Error(result.error.message);
    const entries =
      (result.data?.sessionApplicationLogs as SessionApplicationLogEntry[] | undefined) ?? [];
    useEntityStore.getState().upsertMany("sessionApplicationLogs", entries);
  }, []);

  const processes = useMemo(
    () =>
      Object.values(processTable).filter((process) => process.sessionGroupId === sessionGroupId),
    [processTable, sessionGroupId],
  );
  const endpoints = useMemo(
    () =>
      Object.values(endpointTable).filter((endpoint) => endpoint.sessionGroupId === sessionGroupId),
    [endpointTable, sessionGroupId],
  );
  const setupRuns = useMemo(
    () => Object.values(setupRunTable).filter((run) => run.sessionGroupId === sessionGroupId),
    [sessionGroupId, setupRunTable],
  );

  useEffect(() => {
    for (const process of processes) void loadProcessLogs(process.id).catch(() => undefined);
  }, [loadProcessLogs, processes]);

  const processLogsById = useMemo(() => {
    const processIds = new Set(processes.map((process) => process.id));
    const grouped: Record<string, SessionApplicationLogEntry[]> = {};
    for (const entry of Object.values(processLogTable)) {
      if (processIds.has(entry.processId)) (grouped[entry.processId] ??= []).push(entry);
    }
    for (const entries of Object.values(grouped)) entries.sort((a, b) => a.sequence - b.sequence);
    return grouped;
  }, [processLogTable, processes]);

  const endpointsByProcess = useMemo(() => {
    const grouped = new Map<string, SessionEndpoint[]>();
    for (const endpoint of endpoints) {
      const key = `${endpoint.appConfigId}:${endpoint.processConfigId}`;
      grouped.set(key, [...(grouped.get(key) ?? []), endpoint]);
    }
    return grouped;
  }, [endpoints]);
  const latestSetupRunByScript = useMemo(() => {
    const latest = new Map<string, SessionSetupScriptRun>();
    for (const run of setupRuns) {
      const current = latest.get(run.scriptConfigId);
      if (!current || run.startedAt > current.startedAt) latest.set(run.scriptConfigId, run);
    }
    return latest;
  }, [setupRuns]);
  const processesByKey = useMemo(
    () =>
      new Map(
        processes.map((process) => [`${process.appConfigId}:${process.processConfigId}`, process]),
      ),
    [processes],
  );

  return {
    config,
    endpointsByProcess,
    groupKind,
    latestSetupRunByScript,
    loadProcessLogs,
    processLogsById,
    processesByKey,
    refresh,
  };
}
