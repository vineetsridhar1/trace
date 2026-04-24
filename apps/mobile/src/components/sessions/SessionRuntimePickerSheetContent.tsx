import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SymbolView, type SFSymbol } from "expo-symbols";
import {
  AVAILABLE_RUNTIMES_QUERY,
  UPDATE_SESSION_CONFIG_MUTATION,
  useEntityField,
} from "@trace/client-core";
import type {
  CodingTool,
  HostingMode,
  SessionConnection,
  SessionRuntimeInstance,
} from "@trace/gql";
import { ListRow, Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { applyOptimisticPatch } from "@/lib/optimisticEntity";
import { getConnectionMode } from "@/lib/connection-target";
import { resolveMobileSessionHosting } from "@/lib/session-hosting";
import { getClient } from "@/lib/urql";
import { useTheme } from "@/theme";
import { CLOUD_RUNTIME_ID } from "./session-input-composer/constants";

interface SessionRuntimePickerSheetContentProps {
  sessionId: string;
  onClose?: () => void;
}

interface RuntimeRow {
  key: string;
  title: string;
  subtitle?: string;
  icon: SFSymbol;
  selected: boolean;
  disabled: boolean;
  value: string;
}

export function SessionRuntimePickerSheetContent({
  sessionId,
  onClose,
}: SessionRuntimePickerSheetContentProps) {
  const theme = useTheme();

  const tool = useEntityField("sessions", sessionId, "tool") as string | null | undefined;
  const hosting = useEntityField("sessions", sessionId, "hosting") as string | null | undefined;
  const connection = useEntityField("sessions", sessionId, "connection") as
    | SessionConnection
    | null
    | undefined;
  const sessionGroupId = useEntityField("sessions", sessionId, "sessionGroupId") as
    | string
    | null
    | undefined;
  const repo = useEntityField("sessions", sessionId, "repo") as
    | { id: string }
    | null
    | undefined;
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus") as string | null | undefined;
  const isOptimistic = useEntityField("sessions", sessionId, "_optimistic");

  const currentTool: CodingTool = tool === "codex" ? "codex" : "claude_code";
  const canChangeBridge = agentStatus === "not_started" && !isOptimistic;
  const cloudSessionsEnabled = resolveMobileSessionHosting(getConnectionMode()) === "cloud";
  const runtimeInstanceId = connection?.runtimeInstanceId ?? null;
  const currentRuntimeValue = hosting === "cloud" ? CLOUD_RUNTIME_ID : runtimeInstanceId;

  const [runtimes, setRuntimes] = useState<SessionRuntimeInstance[]>([]);

  useEffect(() => {
    if (!canChangeBridge) return;
    let cancelled = false;
    getClient()
      .query(AVAILABLE_RUNTIMES_QUERY, {
        tool: currentTool,
        sessionGroupId: sessionGroupId ?? null,
      })
      .toPromise()
      .then((result) => {
        if (cancelled) return;
        const data = result.data?.availableRuntimes as
          | SessionRuntimeInstance[]
          | undefined;
        setRuntimes(data ?? []);
      })
      .catch((err) => {
        console.warn("[availableRuntimes] failed", err);
      });
    return () => {
      cancelled = true;
    };
  }, [canChangeBridge, currentTool, sessionGroupId]);

  const rows = useMemo<RuntimeRow[]>(() => {
    const nextRows: RuntimeRow[] = [];

    if (cloudSessionsEnabled) {
      nextRows.push({
        key: `runtime:${CLOUD_RUNTIME_ID}`,
        title: "Cloud",
        icon: "cloud",
        selected: hosting === "cloud",
        disabled: !canChangeBridge,
        value: CLOUD_RUNTIME_ID,
      });
    }

    for (const runtime of runtimes) {
      if (runtime.hostingMode !== "local" || !runtime.connected) continue;
      const lacksRepo = repo?.id ? !runtime.registeredRepoIds.includes(repo.id) : false;
      nextRows.push({
        key: `runtime:${runtime.id}`,
        title: runtime.label,
        subtitle: lacksRepo ? "This runtime does not have the session repo registered." : undefined,
        icon: "laptopcomputer",
        selected: runtimeInstanceId === runtime.id,
        disabled: !canChangeBridge || lacksRepo,
        value: runtime.id,
      });
    }

    return nextRows;
  }, [canChangeBridge, cloudSessionsEnabled, hosting, repo?.id, runtimeInstanceId, runtimes]);

  const handleSelect = useCallback(
    async (value: string) => {
      if (!canChangeBridge || value === currentRuntimeValue) return;

      onClose?.();

      const newIsCloud = cloudSessionsEnabled && value === CLOUD_RUNTIME_ID;
      const runtime = runtimes.find((entry) => entry.id === value);
      const nextHosting: HostingMode = newIsCloud
        ? "cloud"
        : (runtime?.hostingMode ?? "local");
      const nextConnection: SessionConnection = {
        __typename: connection?.__typename ?? "SessionConnection",
        autoRetryable: connection?.autoRetryable ?? null,
        canMove: connection?.canMove ?? true,
        canRetry: connection?.canRetry ?? true,
        lastDeliveryFailureAt: connection?.lastDeliveryFailureAt ?? null,
        lastError: connection?.lastError ?? null,
        lastSeen: connection?.lastSeen ?? null,
        retryCount: connection?.retryCount ?? 0,
        runtimeInstanceId: newIsCloud ? null : value,
        runtimeLabel: newIsCloud ? null : (runtime?.label ?? null),
        state: connection?.state ?? "disconnected",
      };
      const rollback = applyOptimisticPatch("sessions", sessionId, {
        hosting: nextHosting,
        connection: nextConnection,
      });

      void haptic.light();
      try {
        const result = await getClient()
          .mutation(UPDATE_SESSION_CONFIG_MUTATION, {
            sessionId,
            hosting: newIsCloud ? "cloud" : undefined,
            runtimeInstanceId: newIsCloud ? undefined : value,
          })
          .toPromise();
        if (result.error) throw result.error;
      } catch (err) {
        rollback();
        void haptic.error();
        console.warn("[updateSessionConfig] bridge change failed", err);
      }
    },
    [
      canChangeBridge,
      cloudSessionsEnabled,
      connection,
      currentRuntimeValue,
      onClose,
      runtimes,
      sessionId,
    ],
  );

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <Text variant="headline">Runtime</Text>
        <Text variant="footnote" color="mutedForeground">
          Choose where the session should run before it starts.
        </Text>
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surfaceElevated,
            borderColor: theme.colors.borderMuted,
            borderRadius: theme.radius.lg,
          },
        ]}
      >
        {rows.map((row, index) => (
          <ListRow
            key={row.key}
            title={row.title}
            subtitle={row.subtitle}
            leading={
              <SymbolView
                name={row.icon}
                size={16}
                tintColor={theme.colors.mutedForeground}
              />
            }
            trailing={
              row.selected ? (
                <SymbolView
                  name="checkmark"
                  size={16}
                  tintColor={theme.colors.accent}
                />
              ) : undefined
            }
            onPress={
              !row.disabled && !row.selected
                ? () => void handleSelect(row.value)
                : undefined
            }
            haptic={row.selected ? "none" : "selection"}
            separator={index < rows.length - 1}
            style={row.disabled && !row.selected ? styles.disabledRow : undefined}
          />
        ))}
      </View>

      {rows.length === 0 ? (
        <Text variant="footnote" color="mutedForeground">
          No compatible runtimes are available for this session.
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
  },
  header: {
    gap: 4,
  },
  card: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  disabledRow: {
    opacity: 0.5,
  },
});
