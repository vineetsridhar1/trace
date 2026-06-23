import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  Alert,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  UIManager,
  View,
} from "react-native";
import { gql } from "@urql/core";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import * as Clipboard from "expo-clipboard";
import { useEntityField, useEntityStore, type SessionGroupEntity } from "@trace/client-core";
import type {
  EndpointTrafficEntry,
  Repo,
  RepoApplicationConfig,
  SessionApplicationLogEntry,
  SessionApplicationProcess,
  SessionEndpoint,
  SessionSetupScriptRun,
} from "@trace/gql";
import {
  Button,
  EmptyState,
  Glass,
  SegmentedControl,
  Text,
  TraceLoader,
} from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";
import { useMobileUIStore } from "@/stores/ui";
import { alpha, useTheme, type Theme } from "@/theme";

const APPLICATIONS_STATE_QUERY = gql`
  query MobileSessionApplicationsState($sessionGroupId: ID!) {
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
  query MobileSessionApplicationProcessLogs($processId: ID!, $limit: Int) {
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

const ENDPOINT_TRAFFIC_QUERY = gql`
  query MobileEndpointTraffic($endpointId: ID!, $limit: Int) {
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
  mutation MobileRunSessionGroupSetupScript($sessionGroupId: ID!, $scriptId: ID!) {
    runSessionGroupSetupScript(sessionGroupId: $sessionGroupId, scriptId: $scriptId)
  }
`;

const START_PROCESS_MUTATION = gql`
  mutation MobileStartSessionProcess(
    $sessionGroupId: ID!
    $appConfigId: ID!
    $processConfigId: ID!
  ) {
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
  mutation MobileStopSessionProcess(
    $sessionGroupId: ID!
    $appConfigId: ID!
    $processConfigId: ID!
  ) {
    stopSessionProcess(
      sessionGroupId: $sessionGroupId
      appConfigId: $appConfigId
      processConfigId: $processConfigId
    ) {
      id
    }
  }
`;

const START_APPLICATION_MUTATION = gql`
  mutation MobileStartSessionApplication($sessionGroupId: ID!, $appConfigId: ID!) {
    startSessionApplication(sessionGroupId: $sessionGroupId, appConfigId: $appConfigId) {
      id
    }
  }
`;

const STOP_APPLICATION_MUTATION = gql`
  mutation MobileStopSessionApplication($sessionGroupId: ID!, $appConfigId: ID!) {
    stopSessionApplication(sessionGroupId: $sessionGroupId, appConfigId: $appConfigId) {
      id
    }
  }
`;

const ENABLE_ENDPOINT_MUTATION = gql`
  mutation MobileEnableSessionEndpointForwarding($endpointId: ID!) {
    enableSessionEndpointForwarding(endpointId: $endpointId, accessMode: public) {
      id
    }
  }
`;

const DISABLE_ENDPOINT_MUTATION = gql`
  mutation MobileDisableSessionEndpointForwarding($endpointId: ID!) {
    disableSessionEndpointForwarding(endpointId: $endpointId) {
      id
    }
  }
`;

const CLEAR_TRAFFIC_MUTATION = gql`
  mutation MobileClearEndpointTraffic($endpointId: ID!) {
    clearEndpointTraffic(endpointId: $endpointId)
  }
`;

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type ApplicationsStateData = {
  sessionGroup?: ({ id: string; repo?: Repo | null } & Partial<SessionGroupEntity>) | null;
  sessionApplicationProcesses?: SessionApplicationProcess[] | null;
  sessionSetupScriptRuns?: SessionSetupScriptRun[] | null;
  sessionEndpoints?: SessionEndpoint[] | null;
};

type ProcessLogsData = {
  sessionApplicationLogs?: SessionApplicationLogEntry[] | null;
};

type EndpointTrafficData = {
  endpointTraffic?: EndpointTrafficEntry[] | null;
};

type ApplicationTab = "applications" | "traffic";
type SymbolName = ComponentProps<typeof SymbolView>["name"];

const TABS: ApplicationTab[] = ["applications", "traffic"];
const TAB_LABELS = ["Apps", "Traffic"];

function displayStatus(status: string | null | undefined): string {
  if (!status) return "Unknown";
  return `${status[0]?.toUpperCase()}${status.slice(1)}`;
}

function isActive(status: string | null | undefined): boolean {
  return status === "starting" || status === "running" || status === "stopping";
}

function statusIcon(status: string | null | undefined): SymbolName {
  if (status === "running") return "largecircle.fill.circle";
  if (status === "starting" || status === "stopping") return "clock";
  if (status === "failed") return "exclamationmark.circle";
  return "circle";
}

function latestSetupRunByScript(runs: SessionSetupScriptRun[]): Map<string, SessionSetupScriptRun> {
  const latest = new Map<string, SessionSetupScriptRun>();
  for (const run of runs) {
    const current = latest.get(run.scriptConfigId);
    if (!current || run.startedAt > current.startedAt) latest.set(run.scriptConfigId, run);
  }
  return latest;
}

export function ApplicationsSheetContent({
  groupId,
  sessionId,
}: {
  groupId: string;
  sessionId?: string | null;
}) {
  const theme = useTheme();
  const router = useRouter();
  const upsert = useEntityStore((s) => s.upsert);
  const upsertMany = useEntityStore((s) => s.upsertMany);
  const processTable = useEntityStore((s) => s.sessionApplicationProcesses);
  const endpointTable = useEntityStore((s) => s.sessionEndpoints);
  const groupRepo = useEntityField("sessionGroups", groupId, "repo") as
    | { id: string; applicationConfig?: RepoApplicationConfig | null }
    | null
    | undefined;
  const repoApplicationConfig = useEntityStore((s) =>
    groupRepo?.id
      ? (s.repos[groupRepo.id]?.applicationConfig as RepoApplicationConfig | null | undefined)
      : undefined,
  );
  const config = groupRepo?.applicationConfig ?? repoApplicationConfig;

  const [tab, setTab] = useState<ApplicationTab>("applications");
  const [setupRuns, setSetupRuns] = useState<SessionSetupScriptRun[]>([]);
  const [processLogsById, setProcessLogsById] = useState<Record<string, SessionApplicationLogEntry[]>>(
    {},
  );
  const [trafficEntries, setTrafficEntries] = useState<EndpointTrafficEntry[]>([]);
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openSetupLogIds, setOpenSetupLogIds] = useState<Record<string, boolean>>({});
  const [openProcessLogIds, setOpenProcessLogIds] = useState<Record<string, boolean>>({});

  const toggleSetupLogs = useCallback((scriptId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenSetupLogIds((current) => ({ ...current, [scriptId]: !current[scriptId] }));
  }, []);
  const toggleProcessLogs = useCallback((processId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenProcessLogIds((current) => ({ ...current, [processId]: !current[processId] }));
  }, []);

  const processes = useMemo(
    () => Object.values(processTable).filter((process) => process.sessionGroupId === groupId),
    [groupId, processTable],
  );
  const endpoints = useMemo(
    () => Object.values(endpointTable).filter((endpoint) => endpoint.sessionGroupId === groupId),
    [endpointTable, groupId],
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
  const latestSetupRuns = useMemo(() => latestSetupRunByScript(setupRuns), [setupRuns]);
  const selectedEndpoint = useMemo(
    () => endpoints.find((endpoint) => endpoint.id === selectedEndpointId) ?? null,
    [endpoints, selectedEndpointId],
  );

  const refresh = useCallback(async () => {
    setError(null);
    const result = await getClient()
      .query<ApplicationsStateData>(
        APPLICATIONS_STATE_QUERY,
        { sessionGroupId: groupId },
        { requestPolicy: "network-only" },
      )
      .toPromise();
    if (result.error) throw result.error;

    const group = result.data?.sessionGroup;
    if (group?.id) {
      const existingGroup = useEntityStore.getState().sessionGroups[group.id];
      upsert(
        "sessionGroups",
        group.id,
        (existingGroup ? { ...existingGroup, ...group } : group) as SessionGroupEntity,
      );
    }
    const repo = group?.repo;
    if (repo?.id) {
      const existingRepo = useEntityStore.getState().repos[repo.id];
      upsert("repos", repo.id, (existingRepo ? { ...existingRepo, ...repo } : repo) as Repo);
    }
    upsertMany(
      "sessionApplicationProcesses",
      (result.data?.sessionApplicationProcesses ?? []) as Array<
        SessionApplicationProcess & { id: string }
      >,
    );
    upsertMany(
      "sessionEndpoints",
      (result.data?.sessionEndpoints ?? []) as Array<SessionEndpoint & { id: string }>,
    );
    setSetupRuns(result.data?.sessionSetupScriptRuns ?? []);
    setSelectedEndpointId((current) => current ?? result.data?.sessionEndpoints?.[0]?.id ?? null);
  }, [groupId, upsert, upsertMany]);

  const loadProcessLogs = useCallback(async (processId: string) => {
    const result = await getClient()
      .query<ProcessLogsData>(
        PROCESS_LOGS_QUERY,
        { processId, limit: 30 },
        { requestPolicy: "network-only" },
      )
      .toPromise();
    if (result.error) throw result.error;
    setProcessLogsById((current) => ({
      ...current,
      [processId]: result.data?.sessionApplicationLogs ?? [],
    }));
  }, []);

  const loadTraffic = useCallback(async (endpointId: string) => {
    const result = await getClient()
      .query<EndpointTrafficData>(
        ENDPOINT_TRAFFIC_QUERY,
        { endpointId, limit: 100 },
        { requestPolicy: "network-only" },
      )
      .toPromise();
    if (result.error) throw result.error;
    setTrafficEntries(result.data?.endpointTraffic ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void refresh()
      .catch((refreshError) => {
        if (cancelled) return;
        setError(refreshError instanceof Error ? refreshError.message : "Failed to load applications.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    for (const process of processes) {
      void loadProcessLogs(process.id).catch(() => undefined);
    }
  }, [loadProcessLogs, processes]);

  useEffect(() => {
    if (!processes.some((process) => isActive(process.status))) return;
    const interval = setInterval(() => {
      void refresh().catch(() => undefined);
    }, 1500);
    return () => clearInterval(interval);
  }, [processes, refresh]);

  useEffect(() => {
    if (!selectedEndpointId || tab !== "traffic") {
      setTrafficEntries([]);
      return;
    }
    void loadTraffic(selectedEndpointId).catch((trafficError) => {
      setError(trafficError instanceof Error ? trafficError.message : "Failed to load traffic.");
    });
    const interval = setInterval(() => {
      void loadTraffic(selectedEndpointId).catch(() => undefined);
    }, 2000);
    return () => clearInterval(interval);
  }, [loadTraffic, selectedEndpointId, tab]);

  async function runAction(key: string, fn: () => Promise<unknown>) {
    setPending(key);
    setError(null);
    try {
      const result = await fn();
      const operationError =
        result && typeof result === "object" && "error" in result
          ? (result.error as { message?: string } | undefined)
          : undefined;
      if (operationError) throw new Error(operationError.message ?? "Application action failed.");
      await refresh();
      void haptic.success();
    } catch (actionError) {
      void haptic.error();
      const message = actionError instanceof Error ? actionError.message : "Application action failed.";
      setError(message);
      Alert.alert("Application action failed", message);
    } finally {
      setPending(null);
    }
  }

  const openEndpoint = useCallback(
    (endpoint: SessionEndpoint) => {
      if (!sessionId || endpoint.status !== "enabled" || !endpoint.url) return;
      void haptic.light();
      useMobileUIStore.getState().setBrowserUrl(endpoint.url, groupId);
      router.replace(`/sessions/${groupId}/${sessionId}?pane=browser`);
    },
    [groupId, router, sessionId],
  );

  const showTraffic = useCallback((endpointId: string) => {
    setSelectedEndpointId(endpointId);
    setTab("traffic");
  }, []);

  const copyEndpoint = useCallback(async (url: string) => {
    await Clipboard.setStringAsync(url);
    void haptic.light();
  }, []);

  const clearTraffic = useCallback(async () => {
    if (!selectedEndpointId) return;
    await runAction(`traffic:${selectedEndpointId}`, async () => {
      const result = await getClient()
        .mutation(CLEAR_TRAFFIC_MUTATION, { endpointId: selectedEndpointId })
        .toPromise();
      if (result.error) throw result.error;
      setTrafficEntries([]);
      return result;
    });
  }, [selectedEndpointId]);

  const selectedIndex = TABS.indexOf(tab);
  const hasConfig = Boolean(config && (config.setupScripts.length > 0 || config.applications.length > 0));

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingHorizontal: theme.spacing.lg }]}>
        <View style={styles.headerRow}>
          <Text variant="headline">Applications</Text>
          <GlassButton
            symbol="arrow.clockwise"
            accessibilityLabel="Refresh applications"
            disabled={loading}
            onPress={() => {
              setLoading(true);
              void refresh()
                .catch((refreshError) =>
                  setError(
                    refreshError instanceof Error ? refreshError.message : "Failed to load applications.",
                  ),
                )
                .finally(() => setLoading(false));
            }}
          />
        </View>
        <SegmentedControl
          segments={TAB_LABELS}
          selectedIndex={selectedIndex}
          onChange={(index) => setTab(TABS[index] ?? "applications")}
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <TraceLoader size="small" color="mutedForeground" />
        </View>
      ) : tab === "applications" ? (
        <ApplicationsTab
          config={config ?? null}
          endpointsByProcess={endpointsByProcess}
          error={error}
          hasConfig={hasConfig}
          latestSetupRuns={latestSetupRuns}
          onCopyEndpoint={copyEndpoint}
          onOpenEndpoint={openEndpoint}
          onRunAction={runAction}
          onShowTraffic={showTraffic}
          onToggleProcessLogs={toggleProcessLogs}
          onToggleSetupLogs={toggleSetupLogs}
          openProcessLogIds={openProcessLogIds}
          openSetupLogIds={openSetupLogIds}
          pending={pending}
          processesByKey={processesByKey}
          processLogsById={processLogsById}
          sessionGroupId={groupId}
        />
      ) : (
        <TrafficTab
          endpoints={endpoints}
          error={error}
          onClearTraffic={clearTraffic}
          onRefreshTraffic={() => {
            if (!selectedEndpointId) return;
            void loadTraffic(selectedEndpointId).catch((trafficError) =>
              setError(trafficError instanceof Error ? trafficError.message : "Failed to load traffic."),
            );
          }}
          onSelectEndpoint={setSelectedEndpointId}
          pending={pending}
          selectedEndpoint={selectedEndpoint}
          selectedEndpointId={selectedEndpointId}
          trafficEntries={trafficEntries}
        />
      )}
    </View>
  );
}

function ApplicationsTab({
  config,
  endpointsByProcess,
  error,
  hasConfig,
  latestSetupRuns,
  onCopyEndpoint,
  onOpenEndpoint,
  onRunAction,
  onShowTraffic,
  onToggleProcessLogs,
  onToggleSetupLogs,
  openProcessLogIds,
  openSetupLogIds,
  pending,
  processesByKey,
  processLogsById,
  sessionGroupId,
}: {
  config: RepoApplicationConfig | null;
  endpointsByProcess: Map<string, SessionEndpoint[]>;
  error: string | null;
  hasConfig: boolean;
  latestSetupRuns: Map<string, SessionSetupScriptRun>;
  onCopyEndpoint: (url: string) => Promise<void>;
  onOpenEndpoint: (endpoint: SessionEndpoint) => void;
  onRunAction: (key: string, fn: () => Promise<unknown>) => Promise<void>;
  onShowTraffic: (endpointId: string) => void;
  onToggleProcessLogs: (processId: string) => void;
  onToggleSetupLogs: (scriptId: string) => void;
  openProcessLogIds: Record<string, boolean>;
  openSetupLogIds: Record<string, boolean>;
  pending: string | null;
  processesByKey: Map<string, SessionApplicationProcess>;
  processLogsById: Record<string, SessionApplicationLogEntry[]>;
  sessionGroupId: string;
}) {
  const theme = useTheme();
  if (!hasConfig || !config) {
    return (
      <View style={styles.center}>
        <EmptyState
          icon="apps.iphone"
          title="No applications configured"
          subtitle="Configure applications on the repository to start them from sessions."
        />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {error ? (
        <View style={[styles.errorBox, { borderColor: theme.colors.destructive }]}>
          <Text variant="footnote" color="destructive">
            {error}
          </Text>
        </View>
      ) : null}

      {config.setupScripts.length > 0 ? (
        <View style={styles.section}>
          <SectionLabel title="Setup" />
          <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            {config.setupScripts.map((script, index) => {
              const latestRun = latestSetupRuns.get(script.id);
              const running = latestRun?.status === "running";
              const setupLogsOpen = !!openSetupLogIds[script.id];
              return (
                <View key={script.id}>
                  {index > 0 ? (
                    <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
                  ) : null}
                  <View style={styles.cell}>
                    <View style={styles.cellRow}>
                      <View style={styles.iconSlot}>
                        <SymbolView
                          name={running ? "clock" : "terminal"}
                          size={18}
                          tintColor={theme.colors.mutedForeground}
                          resizeMode="scaleAspectFit"
                        />
                      </View>
                      <View style={styles.cellText}>
                        <Text variant="body" numberOfLines={1}>
                          {script.name}
                        </Text>
                        <Text variant="caption2" color="dimForeground" numberOfLines={1}>
                          {latestRun ? displayStatus(latestRun.status) : script.command}
                        </Text>
                      </View>
                      <GlassButton
                        symbol="play.fill"
                        label="Run"
                        accessibilityLabel={`Run ${script.name}`}
                        disabled={pending === script.id || running}
                        onPress={() =>
                          void onRunAction(script.id, () =>
                            getClient()
                              .mutation(RUN_SETUP_MUTATION, { sessionGroupId, scriptId: script.id })
                              .toPromise(),
                          )
                        }
                      />
                    </View>
                    {latestRun ? (
                      <LogsDisclosure
                        open={setupLogsOpen}
                        onToggle={() => onToggleSetupLogs(script.id)}
                      >
                        <Text
                          variant="caption2"
                          color={latestRun.lastError ? "destructive" : "mutedForeground"}
                          style={styles.logBlock}
                        >
                          {(latestRun.lastError ?? latestRun.outputPreview ?? "No logs yet.").trim()}
                        </Text>
                      </LogsDisclosure>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {config.applications.map((application) => {
        const appActive = application.processes.some((processConfig) =>
          isActive(processesByKey.get(`${application.id}:${processConfig.id}`)?.status),
        );
        return (
          <View key={application.id} style={styles.section}>
            <SectionLabel
              title={application.name}
              trailing={
                application.processes.length > 0 ? (
                  <GlassButton
                    symbol={appActive ? "stop.fill" : "play.fill"}
                    label={appActive ? "Stop all" : "Run all"}
                    accessibilityLabel={
                      appActive ? `Stop ${application.name}` : `Run ${application.name}`
                    }
                    tint={appActive ? "destructive" : "foreground"}
                    disabled={pending === `app:${application.id}`}
                    onPress={() =>
                      void onRunAction(`app:${application.id}`, () =>
                        getClient()
                          .mutation(
                            appActive ? STOP_APPLICATION_MUTATION : START_APPLICATION_MUTATION,
                            { sessionGroupId, appConfigId: application.id },
                          )
                          .toPromise(),
                      )
                    }
                  />
                ) : undefined
              }
            />
            <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
              {application.processes.map((processConfig, index) => {
                const process = processesByKey.get(`${application.id}:${processConfig.id}`);
                const endpoints =
                  endpointsByProcess.get(`${application.id}:${processConfig.id}`) ?? [];
                const active = isActive(process?.status);
                const processLogsOpen = process ? !!openProcessLogIds[process.id] : false;
                const logs = process ? (processLogsById[process.id] ?? []).slice(-16) : [];
                return (
                  <View key={processConfig.id}>
                    {index > 0 ? (
                      <View
                        style={[styles.separator, { backgroundColor: theme.colors.border }]}
                      />
                    ) : null}
                    <View style={styles.cell}>
                      <View style={styles.cellRow}>
                        <View style={styles.iconSlot}>
                          <SymbolView
                            name={statusIcon(process?.status)}
                            size={18}
                            tintColor={
                              process?.status === "failed"
                                ? theme.colors.destructive
                                : process?.status === "running"
                                  ? theme.colors.success
                                  : theme.colors.mutedForeground
                            }
                            resizeMode="scaleAspectFit"
                          />
                        </View>
                        <View style={styles.cellText}>
                          <Text variant="body" numberOfLines={1}>
                            {processConfig.name}
                          </Text>
                          <Text
                            variant="caption2"
                            color={process?.status === "failed" ? "destructive" : "dimForeground"}
                            numberOfLines={1}
                          >
                            {process?.lastError ?? displayStatus(process?.status ?? "stopped")}
                          </Text>
                        </View>
                        <GlassButton
                          symbol={active ? "stop.fill" : "play.fill"}
                          label={active ? "Stop" : "Start"}
                          accessibilityLabel={
                            active ? `Stop ${processConfig.name}` : `Start ${processConfig.name}`
                          }
                          tint={active ? "destructive" : "foreground"}
                          disabled={pending === `${application.id}:${processConfig.id}`}
                          onPress={() =>
                            void onRunAction(`${application.id}:${processConfig.id}`, () =>
                              getClient()
                                .mutation(active ? STOP_PROCESS_MUTATION : START_PROCESS_MUTATION, {
                                  sessionGroupId,
                                  appConfigId: application.id,
                                  processConfigId: processConfig.id,
                                })
                                .toPromise(),
                            )
                          }
                        />
                      </View>
                      {process ? (
                        <LogsDisclosure
                          open={processLogsOpen}
                          onToggle={() => onToggleProcessLogs(process.id)}
                        >
                          <View style={styles.logs}>
                            {logs.length === 0 ? (
                              <Text variant="caption2" color="mutedForeground">
                                No logs yet.
                              </Text>
                            ) : (
                              logs.map((log) => (
                                <Text
                                  key={log.id}
                                  variant="caption2"
                                  color={log.stream === "stderr" ? "destructive" : "mutedForeground"}
                                  style={styles.logLine}
                                >
                                  {`${log.stream}: ${log.data.trim() || "(empty)"}`}
                                </Text>
                              ))
                            )}
                          </View>
                        </LogsDisclosure>
                      ) : null}
                      {endpoints.length > 0 ? (
                        <View style={styles.endpointList}>
                          {endpoints.map((endpoint) => (
                            <EndpointRow
                              key={endpoint.id}
                              endpoint={endpoint}
                              onCopyEndpoint={onCopyEndpoint}
                              onOpenEndpoint={onOpenEndpoint}
                              onRunAction={onRunAction}
                              onShowTraffic={onShowTraffic}
                              pending={pending}
                              running={process?.status === "running"}
                            />
                          ))}
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function EndpointRow({
  endpoint,
  onCopyEndpoint,
  onOpenEndpoint,
  onRunAction,
  onShowTraffic,
  pending,
  running,
}: {
  endpoint: SessionEndpoint;
  onCopyEndpoint: (url: string) => Promise<void>;
  onOpenEndpoint: (endpoint: SessionEndpoint) => void;
  onRunAction: (key: string, fn: () => Promise<unknown>) => Promise<void>;
  onShowTraffic: (endpointId: string) => void;
  pending: string | null;
  running: boolean;
}) {
  const theme = useTheme();
  const enabled = endpoint.status === "enabled";
  const canOpen = enabled && endpoint.url.length > 0;
  return (
    <View style={[styles.endpointRow, { borderColor: theme.colors.border }]}>
      <View style={styles.endpointText}>
        <Text variant="subheadline" numberOfLines={1}>
          {endpoint.label}
        </Text>
        <Text variant="caption2" color="dimForeground" numberOfLines={1}>
          {enabled && endpoint.url
            ? endpoint.url
            : `:${endpoint.targetPort} · ${displayStatus(endpoint.status)}`}
        </Text>
      </View>
      <View style={styles.endpointActions}>
        <GlassButton
          symbol={enabled ? "bolt.slash.fill" : "bolt.fill"}
          label={enabled ? "Off" : "On"}
          accessibilityLabel={enabled ? "Disable forwarding" : "Enable forwarding"}
          tint={enabled ? "success" : "foreground"}
          disabled={pending === endpoint.id || (!enabled && !running)}
          onPress={() =>
            void onRunAction(endpoint.id, () =>
              getClient()
                .mutation(enabled ? DISABLE_ENDPOINT_MUTATION : ENABLE_ENDPOINT_MUTATION, {
                  endpointId: endpoint.id,
                })
                .toPromise(),
            )
          }
        />
        <GlassButton
          symbol="arrow.up.forward.app.fill"
          label="Open"
          accessibilityLabel="Open endpoint"
          disabled={!canOpen}
          onPress={() => onOpenEndpoint(endpoint)}
        />
        <GlassButton
          symbol="doc.on.doc"
          label="Copy"
          accessibilityLabel="Copy endpoint URL"
          disabled={!endpoint.url}
          onPress={() => void onCopyEndpoint(endpoint.url)}
        />
        <GlassButton
          symbol="chart.bar.xaxis"
          label="Traffic"
          accessibilityLabel="View endpoint traffic"
          onPress={() => onShowTraffic(endpoint.id)}
        />
      </View>
    </View>
  );
}

function TrafficTab({
  endpoints,
  error,
  onClearTraffic,
  onRefreshTraffic,
  onSelectEndpoint,
  pending,
  selectedEndpoint,
  selectedEndpointId,
  trafficEntries,
}: {
  endpoints: SessionEndpoint[];
  error: string | null;
  onClearTraffic: () => Promise<void>;
  onRefreshTraffic: () => void;
  onSelectEndpoint: (endpointId: string) => void;
  pending: string | null;
  selectedEndpoint: SessionEndpoint | null;
  selectedEndpointId: string | null;
  trafficEntries: EndpointTrafficEntry[];
}) {
  const theme = useTheme();
  return (
    <View style={styles.trafficRoot}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.endpointPills}>
        {endpoints.map((endpoint) => (
          <Button
            key={endpoint.id}
            title={endpoint.label}
            size="sm"
            variant={selectedEndpointId === endpoint.id ? "primary" : "secondary"}
            onPress={() => onSelectEndpoint(endpoint.id)}
          />
        ))}
      </ScrollView>
      <View style={[styles.trafficHeader, { paddingHorizontal: theme.spacing.lg }]}>
        <View style={styles.trafficTitle}>
          <Text variant="subheadline" numberOfLines={1}>
            {selectedEndpoint?.label ?? "Endpoint Traffic"}
          </Text>
          <Text variant="caption2" color="mutedForeground" numberOfLines={1}>
            {selectedEndpoint?.url ?? "Select an endpoint"}
          </Text>
        </View>
        <Button title="Refresh" size="sm" variant="secondary" disabled={!selectedEndpointId} onPress={onRefreshTraffic} />
        <Button
          title="Clear"
          size="sm"
          variant="ghost"
          disabled={!selectedEndpointId || pending === `traffic:${selectedEndpointId}`}
          onPress={() => void onClearTraffic()}
        />
      </View>
      {error ? (
        <View style={[styles.errorBox, { borderColor: theme.colors.destructive }]}>
          <Text variant="footnote" color="destructive">
            {error}
          </Text>
        </View>
      ) : null}
      <ScrollView contentContainerStyle={styles.trafficList}>
        {trafficEntries.length === 0 ? (
          <View style={styles.center}>
            <EmptyState
              icon="network"
              title="No traffic captured"
              subtitle="Requests appear here after the endpoint receives traffic."
            />
          </View>
        ) : (
          trafficEntries.map((entry) => <TrafficEntryRow key={entry.id} entry={entry} />)
        )}
      </ScrollView>
    </View>
  );
}

function TrafficEntryRow({ entry }: { entry: EndpointTrafficEntry }) {
  const theme = useTheme();
  const status = entry.responseStatus ?? (entry.error ? "ERR" : "...");
  return (
    <View style={[styles.trafficRow, { borderColor: theme.colors.border }]}>
      <View style={styles.trafficMethod}>
        <Text variant="caption2" color="mutedForeground">
          {new Date(entry.startedAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </Text>
        <Text variant="subheadline">{entry.requestMethod}</Text>
      </View>
      <View style={styles.trafficPath}>
        <Text variant="subheadline" numberOfLines={1}>
          {entry.requestPath}
        </Text>
        {entry.error ? (
          <Text variant="caption2" color="destructive" numberOfLines={1}>
            {entry.error}
          </Text>
        ) : null}
      </View>
      <View style={styles.trafficStatus}>
        <Text variant="subheadline" align="right">
          {status}
        </Text>
        <Text variant="caption2" color="mutedForeground" align="right">
          {entry.durationMs != null ? `${entry.durationMs}ms` : "-"}
        </Text>
      </View>
    </View>
  );
}

function SectionLabel({ title, trailing }: { title: string; trailing?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text variant="caption1" color="dimForeground" style={styles.sectionLabelText}>
        {title.toUpperCase()}
      </Text>
      {trailing}
    </View>
  );
}

function GlassButton({
  symbol,
  label,
  accessibilityLabel,
  onPress,
  disabled = false,
  tint = "foreground",
}: {
  symbol: SymbolName;
  label?: string;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  tint?: keyof Theme["colors"];
}) {
  const theme = useTheme();
  return (
    <Glass preset="pinnedBar" glassStyleEffect="clear" interactive style={styles.glassButton}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
        disabled={disabled}
        hitSlop={6}
        onPress={() => {
          if (disabled) return;
          void haptic.selection();
          onPress();
        }}
        style={({ pressed }) => [
          styles.glassButtonInner,
          label ? styles.glassButtonWithLabel : styles.glassButtonIconOnly,
          { opacity: disabled ? 0.4 : pressed ? 0.72 : 1 },
        ]}
      >
        <SymbolView
          name={symbol}
          size={14}
          tintColor={theme.colors[tint]}
          resizeMode="scaleAspectFit"
          style={styles.glassButtonGlyph}
        />
        {label ? (
          <Text variant="footnote" color={tint}>
            {label}
          </Text>
        ) : null}
      </Pressable>
    </Glass>
  );
}

function LogsDisclosure({
  open,
  onToggle,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.logsDisclosure}>
      <Pressable
        onPress={onToggle}
        hitSlop={6}
        style={({ pressed }) => [
          styles.logToggle,
          { backgroundColor: pressed ? alpha(theme.colors.foreground, 0.06) : "transparent" },
        ]}
      >
        <Text variant="caption2" color="dimForeground">
          {open ? "Hide logs" : "View logs"}
        </Text>
        <SymbolView
          name={open ? "chevron.up" : "chevron.down"}
          size={11}
          tintColor={theme.colors.dimForeground}
          resizeMode="scaleAspectFit"
        />
      </Pressable>
      {open ? children : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    gap: 12,
    paddingTop: 12,
    paddingBottom: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 22,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 36,
    paddingLeft: 4,
    paddingBottom: 8,
  },
  sectionLabelText: {
    letterSpacing: 0.6,
  },
  card: {
    borderRadius: 14,
    overflow: "hidden",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 54,
    opacity: 0.55,
  },
  cell: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cellRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconSlot: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  cellText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  glassButton: {
    borderRadius: 9999,
    overflow: "hidden",
  },
  glassButtonInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 36,
  },
  glassButtonWithLabel: {
    paddingHorizontal: 14,
  },
  glassButtonIconOnly: {
    width: 40,
  },
  glassButtonGlyph: {
    width: 14,
    height: 14,
  },
  logsDisclosure: {
    marginTop: 10,
    gap: 6,
  },
  logToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  logBlock: {
    fontFamily: "SpaceMono",
  },
  logs: {
    gap: 4,
  },
  logLine: {
    fontFamily: "SpaceMono",
  },
  endpointList: {
    gap: 8,
    marginTop: 10,
  },
  endpointRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    gap: 10,
  },
  endpointText: {
    minWidth: 0,
  },
  endpointActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  errorBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
  },
  trafficRoot: {
    flex: 1,
  },
  endpointPills: {
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  trafficHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 12,
  },
  trafficTitle: {
    flex: 1,
    minWidth: 0,
  },
  trafficList: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  trafficRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  trafficMethod: {
    width: 58,
  },
  trafficPath: {
    flex: 1,
    minWidth: 0,
  },
  trafficStatus: {
    width: 58,
  },
});
