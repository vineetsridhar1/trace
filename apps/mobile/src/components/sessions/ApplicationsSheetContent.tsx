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
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { gql } from "@urql/core";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import * as Clipboard from "expo-clipboard";
import { useEntityField, useEntityStore, type SessionGroupEntity } from "@trace/client-core";
import type {
  Repo,
  RepoApplicationConfig,
  SessionApplicationLogEntry,
  SessionApplicationProcess,
  SessionEndpoint,
  SessionSetupScriptRun,
} from "@trace/gql";
import { EmptyState, Text, TraceLoader } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";
import { useMobileUIStore } from "@/stores/ui";
import { alpha, useTheme } from "@/theme";
import { GlassButton } from "./GlassButton";

const HEADER_BLUR_INTENSITY = 3;
const HEADER_FADE_EXTRA_HEIGHT = 56;
const HEADER_CONTENT_HEIGHT = 36;

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

type SymbolName = ComponentProps<typeof SymbolView>["name"];

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
  const insets = useSafeAreaInsets();
  const topInset = insets.top + theme.spacing.sm;
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

  const [setupRuns, setSetupRuns] = useState<SessionSetupScriptRun[]>([]);
  const [processLogsById, setProcessLogsById] = useState<Record<string, SessionApplicationLogEntry[]>>(
    {},
  );
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

  const showTraffic = useCallback(
    (endpointId: string) => {
      void haptic.selection();
      const params = new URLSearchParams({ groupId, endpointId });
      router.push(`/sheets/applications-traffic?${params.toString()}`);
    },
    [groupId, router],
  );

  const copyEndpoint = useCallback(async (url: string) => {
    await Clipboard.setStringAsync(url);
    void haptic.light();
  }, []);

  const hasConfig = Boolean(config && (config.setupScripts.length > 0 || config.applications.length > 0));

  const headerBottom = topInset + HEADER_CONTENT_HEIGHT;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {loading ? (
        <View style={styles.center}>
          <TraceLoader size="small" color="mutedForeground" />
        </View>
      ) : (
        <ApplicationsTab
          config={config ?? null}
          contentPaddingBottom={insets.bottom + theme.spacing.xxl}
          contentPaddingTop={headerBottom + theme.spacing.sm}
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
      )}
      <BlurView
        pointerEvents="none"
        tint={theme.scheme === "dark" ? "systemThinMaterialDark" : "systemThinMaterial"}
        intensity={HEADER_BLUR_INTENSITY}
        style={[styles.topBlur, { height: headerBottom - 8 }]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[
          alpha(theme.colors.background, 1),
          alpha(theme.colors.background, 0.48),
          alpha(theme.colors.background, 0),
        ]}
        locations={[0, 0.68, 1]}
        style={[styles.topFade, { height: headerBottom + HEADER_FADE_EXTRA_HEIGHT }]}
      />
      <View
        style={[
          styles.floatingHeader,
          { top: topInset, paddingHorizontal: theme.spacing.lg },
        ]}
      >
        <Text variant="title2">Applications</Text>
        <GlassButton
          symbol="arrow.clockwise"
          accessibilityLabel="Refresh applications"
          disabled={loading}
          onPress={() => {
            setLoading(true);
            void refresh()
              .catch((refreshError) =>
                setError(
                  refreshError instanceof Error
                    ? refreshError.message
                    : "Failed to load applications.",
                ),
              )
              .finally(() => setLoading(false));
          }}
        />
      </View>
    </View>
  );
}

function ApplicationsTab({
  config,
  contentPaddingBottom,
  contentPaddingTop,
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
  contentPaddingBottom: number;
  contentPaddingTop: number;
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
      <View style={[styles.center, { paddingTop: contentPaddingTop }]}>
        <EmptyState
          icon="apps.iphone"
          title="No applications configured"
          subtitle="Configure applications on the repository to start them from sessions."
        />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingTop: contentPaddingTop, paddingBottom: contentPaddingBottom },
      ]}
      scrollIndicatorInsets={{ top: contentPaddingTop }}
    >
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
  topFade: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9,
  },
  topBlur: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 8,
  },
  floatingHeader: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: HEADER_CONTENT_HEIGHT,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  content: {
    paddingHorizontal: 16,
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
    marginHorizontal: 14,
    opacity: 1,
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
    marginBottom: 12,
    padding: 12,
  },
});
