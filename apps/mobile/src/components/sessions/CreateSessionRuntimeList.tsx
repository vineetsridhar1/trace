import { StyleSheet, View } from "react-native";
import { SymbolView, type SFSymbol } from "expo-symbols";
import type { SessionRuntimeInstance } from "@trace/gql";
import { ListRow, Spinner, Text } from "@/components/design-system";
import { CLOUD_RUNTIME_ID } from "@/hooks/useCreateSession";
import { useTheme } from "@/theme";

export interface CreateSessionRuntimeListProps {
  runtimes: readonly SessionRuntimeInstance[];
  loading: boolean;
  selectedRuntimeId: string;
  channelRepoId: string | undefined;
  onSelect: (runtimeId: string) => void;
}

export function CreateSessionRuntimeList({
  runtimes,
  loading,
  selectedRuntimeId,
  channelRepoId,
  onSelect,
}: CreateSessionRuntimeListProps) {
  const theme = useTheme();
  const connected = runtimes.filter((r) => r.connected);

  return (
    <View
      style={[
        styles.list,
        {
          backgroundColor: theme.colors.surfaceElevated,
          borderColor: theme.colors.borderMuted,
          borderRadius: theme.radius.lg,
        },
      ]}
    >
      <ListRow
        title="Cloud"
        subtitle="On-demand"
        leading={<RuntimeIcon mode="cloud" />}
        trailing={
          selectedRuntimeId === CLOUD_RUNTIME_ID ? (
            <SymbolView
              name="checkmark"
              size={16}
              tintColor={theme.colors.accent}
            />
          ) : undefined
        }
        onPress={() => onSelect(CLOUD_RUNTIME_ID)}
        haptic={selectedRuntimeId === CLOUD_RUNTIME_ID ? "none" : "selection"}
        separator={loading || connected.length > 0}
      />
      {loading ? (
        <View style={styles.loading}>
          <Spinner size="small" color="mutedForeground" />
          <Text variant="footnote" color="mutedForeground">
            Loading bridges…
          </Text>
        </View>
      ) : null}
      {!loading
        ? connected.map((runtime, index) => {
            const lacksRepo =
              channelRepoId !== undefined
              && runtime.hostingMode === "local"
              && !runtime.registeredRepoIds.includes(channelRepoId);
            const active = runtime.id === selectedRuntimeId;
            const subtitleParts: string[] = [];
            if (runtime.sessionCount > 0) {
              subtitleParts.push(
                `${runtime.sessionCount} session${runtime.sessionCount === 1 ? "" : "s"}`,
              );
            }
            if (lacksRepo) subtitleParts.push("Repo not linked");
            return (
              <ListRow
                key={runtime.id}
                title={runtime.label}
                subtitle={subtitleParts.join(" · ") || undefined}
                leading={<RuntimeIcon mode={runtime.hostingMode} />}
                trailing={
                  active ? (
                    <SymbolView
                      name="checkmark"
                      size={16}
                      tintColor={theme.colors.accent}
                    />
                  ) : undefined
                }
                onPress={lacksRepo ? undefined : () => onSelect(runtime.id)}
                haptic={active ? "none" : "selection"}
                separator={index < connected.length - 1}
                style={lacksRepo ? styles.disabled : undefined}
              />
            );
          })
        : null}
    </View>
  );
}

function RuntimeIcon({ mode }: { mode: "cloud" | "local" }) {
  const theme = useTheme();
  const symbol: SFSymbol = mode === "cloud" ? "cloud" : "laptopcomputer";
  const tint = mode === "cloud" ? theme.colors.accent : theme.colors.success;
  return <SymbolView name={symbol} size={18} tintColor={tint} />;
}

const styles = StyleSheet.create({
  list: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  loading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  disabled: {
    opacity: 0.4,
  },
});
