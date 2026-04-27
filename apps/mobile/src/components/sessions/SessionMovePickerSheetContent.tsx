import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { SymbolView, type SFSymbol } from "expo-symbols";
import {
  AVAILABLE_SESSION_RUNTIMES_QUERY,
  MOVE_SESSION_TO_RUNTIME_MUTATION,
  useEntityField,
} from "@trace/client-core";
import type { SessionConnection, SessionRuntimeInstance } from "@trace/gql";
import { ListRow, Spinner, Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";
import { useTheme } from "@/theme";

interface SessionMovePickerSheetContentProps {
  sessionId: string;
  onClose?: () => void;
}

interface RuntimeRow {
  key: string;
  title: string;
  subtitle?: string;
  icon: SFSymbol;
  value: string;
  disabled?: boolean;
}

export function SessionMovePickerSheetContent({
  sessionId,
  onClose,
}: SessionMovePickerSheetContentProps) {
  const theme = useTheme();

  const repo = useEntityField("sessions", sessionId, "repo") as { id: string } | null | undefined;
  const sessionGroupId = useEntityField("sessions", sessionId, "sessionGroupId") as
    | string
    | null
    | undefined;
  const sessionStatus = useEntityField("sessions", sessionId, "sessionStatus") as
    | string
    | null
    | undefined;
  const isOptimistic = useEntityField("sessions", sessionId, "_optimistic");
  const connection = useEntityField("sessions", sessionId, "connection") as
    | SessionConnection
    | null
    | undefined;
  const groupConnection = useEntityField("sessionGroups", sessionGroupId ?? "", "connection") as
    | SessionConnection
    | null
    | undefined;

  const currentRuntimeInstanceId =
    connection?.runtimeInstanceId ?? groupConnection?.runtimeInstanceId ?? null;
  const canMoveSession =
    sessionStatus !== "merged" && !isOptimistic && (connection?.canMove ?? true);

  const [runtimes, setRuntimes] = useState<SessionRuntimeInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getClient()
      .query(AVAILABLE_SESSION_RUNTIMES_QUERY, { sessionId })
      .toPromise()
      .then((result) => {
        if (cancelled) return;
        const data = result.data?.availableSessionRuntimes as SessionRuntimeInstance[] | undefined;
        setRuntimes(data ?? []);
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("[availableSessionRuntimes] failed", error);
        Alert.alert("Couldn't load runtimes", "Try again in a moment.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const rows = useMemo<RuntimeRow[]>(() => {
    const nextRows: RuntimeRow[] = [];

    for (const runtime of runtimes) {
      if (runtime.hostingMode !== "local") continue;
      if (runtime.id === currentRuntimeInstanceId) continue;
      const lacksRepo =
        !!repo?.id &&
        runtime.hostingMode === "local" &&
        !runtime.registeredRepoIds.includes(repo.id);

      nextRows.push({
        key: `runtime:${runtime.id}`,
        title: runtime.label,
        subtitle: lacksRepo
          ? "This runtime does not have the session repo registered."
          : !runtime.connected
            ? "This runtime is offline."
            : undefined,
        icon: "laptopcomputer",
        value: runtime.id,
        disabled: !runtime.connected || lacksRepo,
      });
    }

    return nextRows;
  }, [currentRuntimeInstanceId, repo?.id, runtimes]);

  const handleMoveToRuntime = useCallback(
    async (runtimeInstanceId: string) => {
      if (!canMoveSession) return;
      setMoving(runtimeInstanceId);
      void haptic.light();
      try {
        const result = await getClient()
          .mutation(MOVE_SESSION_TO_RUNTIME_MUTATION, { sessionId, runtimeInstanceId })
          .toPromise();
        if (result.error || !result.data?.moveSessionToRuntime?.id) {
          throw result.error ?? new Error("No session returned");
        }
        void haptic.success();
        onClose?.();
      } catch (error) {
        void haptic.error();
        const message = error instanceof Error ? error.message : "Unknown error";
        Alert.alert("Couldn't move session", message);
      } finally {
        setMoving(null);
      }
    },
    [canMoveSession, onClose, sessionId],
  );

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <Text variant="headline">Move session</Text>
        <Text variant="footnote" color="mutedForeground">
          Continue this session on another runtime.
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
        {loading ? (
          <View style={styles.loadingRow}>
            <Spinner size="small" color="mutedForeground" />
          </View>
        ) : (
          rows.map((row, index) => (
            <ListRow
              key={row.key}
              title={row.title}
              subtitle={row.subtitle}
              leading={
                <SymbolView name={row.icon} size={16} tintColor={theme.colors.mutedForeground} />
              }
              trailing={
                moving === row.value ? <Spinner size="small" color="mutedForeground" /> : undefined
              }
              onPress={
                !row.disabled && moving === null
                  ? () => void handleMoveToRuntime(row.value)
                  : undefined
              }
              haptic="selection"
              separator={index < rows.length - 1}
              style={row.disabled ? styles.disabledRow : undefined}
            />
          ))
        )}
      </View>

      {!loading && rows.length === 0 ? (
        <Text variant="footnote" color="mutedForeground">
          No other runtimes are available for this session.
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
  loadingRow: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 64,
  },
  disabledRow: {
    opacity: 0.5,
  },
});
