import { useCallback, useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEntityField, useEntityStore } from "@trace/client-core";
import type { PortEndpoint, SessionEndpoints } from "@trace/gql";
import { Button, EmptyState, ListRow, Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { buildRunScriptsCommand, isRunScriptArray } from "@/lib/runScripts";
import { useMobileUIStore } from "@/stores/ui";
import { useTheme } from "@/theme";
import { useSessionPorts } from "@/hooks/useSessionPorts";

function portSubtitle(port: PortEndpoint): string {
  const status = port.status ? `${port.status[0]?.toUpperCase()}${port.status.slice(1)}` : "Ready";
  return `${status} - ${port.url}`;
}

function sortPorts(ports: PortEndpoint[]): PortEndpoint[] {
  return [...ports].sort((a, b) => a.port - b.port || a.label.localeCompare(b.label));
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
  useSessionPorts(sessionId, Boolean(sessionId));

  const sessionEndpoints = useEntityField("sessions", sessionId ?? "", "endpoints") as
    | SessionEndpoints
    | null
    | undefined;
  const sessionGroupChannel = useEntityField("sessionGroups", groupId, "channel") as
    | { id?: string | null }
    | null
    | undefined;
  const rawChannelId = useEntityStore(
    (state) =>
      (state.sessionGroups[groupId] as { channelId?: string | null } | undefined)?.channelId ??
      null,
  );
  const channelId = sessionGroupChannel?.id ?? rawChannelId ?? null;
  const rawRunScripts = useEntityField("channels", channelId ?? "", "runScripts");
  const runScripts = isRunScriptArray(rawRunScripts) ? rawRunScripts : [];
  const ports = useMemo(() => sortPorts(sessionEndpoints?.ports ?? []), [sessionEndpoints?.ports]);

  const openPort = useCallback(
    (port: PortEndpoint) => {
      if (!sessionId) return;
      void haptic.light();
      useMobileUIStore.getState().setBrowserUrl(port.url, groupId);
      router.replace(`/sessions/${groupId}/${sessionId}?pane=browser`);
    },
    [groupId, router, sessionId],
  );

  const startApplications = useCallback(() => {
    if (!sessionId || runScripts.length === 0) return;
    void haptic.light();
    useMobileUIStore
      .getState()
      .queueTerminalInitialCommand(sessionId, `${buildRunScriptsCommand(runScripts)}\n`);
    router.replace(`/sessions/${groupId}/${sessionId}?pane=terminal`);
  }, [groupId, router, runScripts, sessionId]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingHorizontal: theme.spacing.lg }]}>
        <Text variant="headline">Applications</Text>
        <Text variant="footnote" color="mutedForeground">
          App scripts and runtime ports.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {runScripts.length > 0 ? (
          <View style={styles.section}>
            <View style={[styles.sectionHeader, { paddingHorizontal: theme.spacing.lg }]}>
              <Text variant="subheadline" color="mutedForeground">
                Start
              </Text>
            </View>
            <View style={{ paddingHorizontal: theme.spacing.lg }}>
              <Button title="Start applications" onPress={startApplications} />
            </View>
            <View style={styles.scriptList}>
              {runScripts.map((script, index) => (
                <ListRow
                  key={`${script.name}:${index}`}
                  title={script.name}
                  subtitle={script.command}
                  leading={
                    <SymbolView
                      name="play.circle"
                      size={22}
                      tintColor={theme.colors.mutedForeground}
                    />
                  }
                />
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={[styles.sectionHeader, { paddingHorizontal: theme.spacing.lg }]}>
            <Text variant="subheadline" color="mutedForeground">
              Running
            </Text>
          </View>
          {ports.length > 0 ? (
            ports.map((port) => (
              <ListRow
                key={`${port.port}:${port.url}`}
                title={port.label || `Port ${port.port}`}
                subtitle={portSubtitle(port)}
                leading={
                  <SymbolView
                    name="network"
                    size={22}
                    tintColor={theme.colors.mutedForeground}
                  />
                }
                trailing={
                  <Text variant="footnote" color="mutedForeground">
                    {port.port}
                  </Text>
                }
                disclosureIndicator
                onPress={() => openPort(port)}
              />
            ))
          ) : (
            <View style={styles.empty}>
              <EmptyState
                icon="network.slash"
                title="No running applications"
                subtitle={
                  runScripts.length > 0
                    ? "Start applications, then open a published port here."
                    : "No application scripts or published ports are available yet."
                }
              />
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    gap: 6,
    paddingTop: 12,
    paddingBottom: 16,
  },
  content: {
    paddingBottom: 32,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    paddingBottom: 8,
  },
  scriptList: {
    marginTop: 10,
  },
  empty: {
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
});
