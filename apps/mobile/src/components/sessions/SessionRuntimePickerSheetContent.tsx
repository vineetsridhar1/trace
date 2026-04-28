import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SymbolView, type SFSymbol } from "expo-symbols";
import {
  AVAILABLE_SESSION_RUNTIMES_QUERY,
  REQUEST_BRIDGE_ACCESS_MUTATION,
  UPDATE_SESSION_CONFIG_MUTATION,
  useEntityField,
} from "@trace/client-core";
import type { BridgeAccessCapability, SessionConnection, SessionRuntimeInstance } from "@trace/gql";
import { ListRow, Spinner, Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { applyOptimisticPatch } from "@/lib/optimisticEntity";
import { getClient } from "@/lib/urql";
import { subscribeBridgeAccessEvents } from "@/lib/bridge-access-events";
import { alpha, useTheme } from "@/theme";

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
  accessAllowed: boolean;
  lacksRepo: boolean;
}

function RuntimeRequestPill({
  title,
  disabled,
  loading,
  onPress,
}: {
  title: string;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.requestPill,
        {
          backgroundColor: theme.colors.surfaceElevated,
          opacity: disabled ? 0.5 : 1,
        },
        pressed && !inactive ? { backgroundColor: alpha(theme.colors.foreground, 0.08) } : null,
      ]}
    >
      {loading ? (
        <Spinner size="small" color="foreground" />
      ) : (
        <Text variant="subheadline" color="foreground" align="center">
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function SessionRuntimePickerSheetContent({
  sessionId,
  onClose,
  onSelectRuntime,
}: SessionRuntimePickerSheetContentProps) {
  const theme = useTheme();

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

  const canChangeBridge = agentStatus === "not_started" && !isOptimistic;
  const runtimeInstanceId = connection?.runtimeInstanceId ?? null;
  const currentRuntimeValue = runtimeInstanceId;

  const [runtimes, setRuntimes] = useState<SessionRuntimeInstance[]>([]);
  const [requestingRuntimeId, setRequestingRuntimeId] = useState<string | null>(null);
  const [showOtherRuntimes, setShowOtherRuntimes] = useState(false);

  const fetchRuntimes = useCallback(async (): Promise<SessionRuntimeInstance[]> => {
    if (!canChangeBridge) {
      return [];
    }
    const result = await getClient()
      .query(AVAILABLE_SESSION_RUNTIMES_QUERY, {
        sessionId,
      })
      .toPromise();
    const data = result.data?.availableSessionRuntimes as SessionRuntimeInstance[] | undefined;
    return data ?? [];
  }, [canChangeBridge, sessionId]);

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

  useEffect(() => {
    if (!canChangeBridge) return;
    let cancelled = false;
    const unsubscribe = subscribeBridgeAccessEvents(() => {
      void fetchRuntimes()
        .then((data) => {
          if (!cancelled) setRuntimes(data);
        })
        .catch((err) => {
          if (!cancelled) console.warn("[availableRuntimes] refresh failed", err);
        });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [canChangeBridge, fetchRuntimes]);

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
        accessAllowed,
        lacksRepo,
      });
    }

    return nextRows;
  }, [canChangeBridge, repo?.id, runtimeInstanceId, runtimes]);

  const accessibleRows = useMemo(() => rows.filter((row) => row.accessAllowed), [rows]);
  const requestableRows = useMemo(() => rows.filter((row) => row.canRequestAccess), [rows]);
  const hasCompatibleAccessibleRuntime = accessibleRows.some((row) => !row.lacksRepo);
  const shouldShowRequestableRows = !hasCompatibleAccessibleRuntime || showOtherRuntimes;
  const visibleRows = shouldShowRequestableRows
    ? [...accessibleRows, ...requestableRows]
    : accessibleRows;
  const showOtherRuntimesToggle = hasCompatibleAccessibleRuntime && requestableRows.length > 0;
  const cardRowCount = visibleRows.length + (showOtherRuntimesToggle ? 1 : 0);

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
        {visibleRows.map((row, index) => (
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
                <RuntimeRequestPill
                  title={row.requestPending ? "Pending" : "Request"}
                  disabled={row.requestPending}
                  loading={requestingRuntimeId === row.runtime.id}
                  onPress={() => void handleRequestAccess(row.runtime)}
                />
              ) : undefined
            }
            onPress={!row.disabled ? () => void handleSelect(row.value) : undefined}
            haptic="selection"
            separator={index < cardRowCount - 1}
            style={
              row.disabled && !row.selected && !row.canRequestAccess
                ? styles.disabledRow
                : undefined
            }
          />
        ))}
        {showOtherRuntimesToggle ? (
          <ListRow
            title={showOtherRuntimes ? "Hide other runtimes" : "See other runtimes"}
            subtitle={`${requestableRows.length} available to request`}
            leading={
              <SymbolView name="person.2" size={16} tintColor={theme.colors.mutedForeground} />
            }
            trailing={
              <SymbolView
                name={showOtherRuntimes ? "chevron.up" : "chevron.down"}
                size={14}
                tintColor={theme.colors.dimForeground}
              />
            }
            onPress={() => setShowOtherRuntimes((current) => !current)}
            haptic="selection"
            separator={false}
          />
        ) : null}
      </View>

      {visibleRows.length === 0 ? (
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
  requestPill: {
    minHeight: 36,
    minWidth: 86,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  disabledRow: {
    opacity: 0.5,
  },
});
