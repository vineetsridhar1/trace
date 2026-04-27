import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { SymbolView, type SFSymbol } from "expo-symbols";
import {
  AVAILABLE_RUNTIMES_QUERY,
  REQUEST_BRIDGE_ACCESS_MUTATION,
  UPDATE_SESSION_CONFIG_MUTATION,
  useEntityField,
} from "@trace/client-core";
import type {
  BridgeAccessCapability,
  CodingTool,
  SessionConnection,
  SessionRuntimeInstance,
} from "@trace/gql";
import { Button, Glass, ListRow, Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { applyOptimisticPatch } from "@/lib/optimisticEntity";
import { getClient } from "@/lib/urql";
import { useTheme } from "@/theme";

interface SessionRuntimePickerSheetContentProps {
  sessionId: string;
  onClose?: () => void;
  onSelectRuntime?: () => void | Promise<void>;
}

interface RuntimeRow {
  key: string;
  title: string;
  subtitle?: string;
  icon: SFSymbol;
  selected: boolean;
  disabled: boolean;
  value: string;
  runtime: SessionRuntimeInstance;
  requestPending: boolean;
  canRequestAccess: boolean;
}

export function SessionRuntimePickerSheetContent({
  sessionId,
  onClose,
  onSelectRuntime,
}: SessionRuntimePickerSheetContentProps) {
  const theme = useTheme();

  const tool = useEntityField("sessions", sessionId, "tool") as string | null | undefined;
  const connection = useEntityField("sessions", sessionId, "connection") as
    | SessionConnection
    | null
    | undefined;
  const sessionGroupId = useEntityField("sessions", sessionId, "sessionGroupId") as
    | string
    | null
    | undefined;
  const repo = useEntityField("sessions", sessionId, "repo") as { id: string } | null | undefined;
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus") as
    | string
    | null
    | undefined;
  const isOptimistic = useEntityField("sessions", sessionId, "_optimistic");

  const currentTool: CodingTool = tool === "codex" ? "codex" : "claude_code";
  const canChangeBridge = agentStatus === "not_started" && !isOptimistic;
  const runtimeInstanceId = connection?.runtimeInstanceId ?? null;
  const currentRuntimeValue = runtimeInstanceId;

  const [runtimes, setRuntimes] = useState<SessionRuntimeInstance[]>([]);
  const [requestingRuntimeId, setRequestingRuntimeId] = useState<string | null>(null);

  const fetchRuntimes = useCallback(async (): Promise<SessionRuntimeInstance[]> => {
    if (!canChangeBridge) {
      return [];
    }
    const result = await getClient()
      .query(AVAILABLE_RUNTIMES_QUERY, {
        tool: currentTool,
        sessionGroupId: sessionGroupId ?? null,
      })
      .toPromise();
    const data = result.data?.availableRuntimes as SessionRuntimeInstance[] | undefined;
    return data ?? [];
  }, [canChangeBridge, currentTool, sessionGroupId]);

  useEffect(() => {
    let cancelled = false;
    fetchRuntimes()
      .then((data) => {
        if (!cancelled) setRuntimes(data);
      })
      .catch((err) => {
        if (!cancelled) console.warn("[availableRuntimes] failed", err);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchRuntimes]);

  const rows = useMemo<RuntimeRow[]>(() => {
    const nextRows: RuntimeRow[] = [];

    for (const runtime of runtimes) {
      if (runtime.hostingMode !== "local" || !runtime.connected) continue;
      const lacksRepo = repo?.id ? !runtime.registeredRepoIds.includes(repo.id) : false;
      const accessAllowed = runtime.access.allowed;
      const requestPending = !accessAllowed && runtime.access.pendingRequest?.status === "pending";
      const ownerName = runtime.access.ownerUser?.name?.trim() || "the bridge owner";
      nextRows.push({
        key: `runtime:${runtime.id}`,
        title: runtime.label,
        subtitle: lacksRepo
          ? "This runtime does not have the session repo registered."
          : accessAllowed
            ? undefined
            : requestPending
              ? "Request pending."
              : `Request access from ${ownerName}.`,
        icon: "laptopcomputer",
        selected: runtimeInstanceId === runtime.id,
        disabled: !canChangeBridge || lacksRepo || !accessAllowed,
        value: runtime.id,
        runtime,
        requestPending,
        canRequestAccess: !accessAllowed && !lacksRepo,
      });
    }

    return nextRows;
  }, [canChangeBridge, repo?.id, runtimeInstanceId, runtimes]);

  const handleRequestAccess = useCallback(
    async (runtime: SessionRuntimeInstance) => {
      if (requestingRuntimeId || runtime.access.pendingRequest?.status === "pending") return;
      setRequestingRuntimeId(runtime.id);
      try {
        const result = await getClient()
          .mutation(REQUEST_BRIDGE_ACCESS_MUTATION, {
            runtimeInstanceId: runtime.id,
            scopeType: sessionGroupId ? "session_group" : "all_sessions",
            sessionGroupId: sessionGroupId ?? undefined,
            requestedCapabilities: ["session", "terminal"] satisfies BridgeAccessCapability[],
          })
          .toPromise();
        if (result.error) throw result.error;
        setRuntimes(await fetchRuntimes());
      } catch (err) {
        Alert.alert(
          "Request failed",
          err instanceof Error ? err.message : "Couldn't request bridge access",
        );
      } finally {
        setRequestingRuntimeId(null);
      }
    },
    [fetchRuntimes, requestingRuntimeId, sessionGroupId],
  );

  const handleSelect = useCallback(
    async (value: string) => {
      if (!canChangeBridge) return;

      const unchanged = value === currentRuntimeValue;
      if (unchanged) {
        onClose?.();
        await onSelectRuntime?.();
        return;
      }
      const runtime = runtimes.find((entry) => entry.id === value);
      const nextConnection: SessionConnection = {
        __typename: connection?.__typename ?? "SessionConnection",
        autoRetryable: connection?.autoRetryable ?? null,
        canMove: connection?.canMove ?? true,
        canRetry: connection?.canRetry ?? true,
        lastDeliveryFailureAt: connection?.lastDeliveryFailureAt ?? null,
        lastError: connection?.lastError ?? null,
        lastSeen: connection?.lastSeen ?? null,
        retryCount: connection?.retryCount ?? 0,
        runtimeInstanceId: value,
        runtimeLabel: runtime?.label ?? null,
        state: connection?.state ?? "disconnected",
      };
      const rollback = applyOptimisticPatch("sessions", sessionId, {
        hosting: runtime?.hostingMode ?? "local",
        connection: nextConnection,
      });

      void haptic.light();
      try {
        const result = await getClient()
          .mutation(UPDATE_SESSION_CONFIG_MUTATION, {
            sessionId,
            hosting: "local",
            runtimeInstanceId: value,
          })
          .toPromise();
        if (result.error) throw result.error;
        onClose?.();
        await onSelectRuntime?.();
      } catch (err) {
        rollback();
        void haptic.error();
        console.warn("[updateSessionConfig] bridge change failed", err);
      }
    },
    [
      canChangeBridge,
      connection,
      currentRuntimeValue,
      onSelectRuntime,
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
          Choose where the session should start.
        </Text>
      </View>

      <Glass
        preset="card"
        interactive
        style={[styles.card, { borderColor: theme.colors.borderMuted }]}
      >
        {rows.map((row, index) => (
          <ListRow
            key={row.key}
            title={row.title}
            subtitle={row.subtitle}
            leading={
              <SymbolView name={row.icon} size={16} tintColor={theme.colors.mutedForeground} />
            }
            trailing={
              row.selected ? (
                <SymbolView name="checkmark" size={16} tintColor={theme.colors.accent} />
              ) : row.canRequestAccess ? (
                <Button
                  title={row.requestPending ? "Pending" : "Request"}
                  size="sm"
                  variant="secondary"
                  disabled={row.requestPending}
                  loading={requestingRuntimeId === row.runtime.id}
                  onPress={() => void handleRequestAccess(row.runtime)}
                />
              ) : undefined
            }
            onPress={!row.disabled ? () => void handleSelect(row.value) : undefined}
            haptic="selection"
            separator={index < rows.length - 1}
            style={row.disabled && !row.selected ? styles.disabledRow : undefined}
          />
        ))}
      </Glass>

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
