import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { gql } from "@urql/core";
import { useRouter } from "expo-router";
import { useEntityStore } from "@trace/client-core";
import type { EndpointTrafficEntry, SessionEndpoint } from "@trace/gql";
import { EmptyState, Text, TraceLoader } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";
import { alpha, useTheme } from "@/theme";
import { GlassButton } from "./GlassButton";

const HEADER_BLUR_INTENSITY = 3;
const HEADER_FADE_EXTRA_HEIGHT = 56;
const HEADER_CONTENT_HEIGHT = 44;

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

const CLEAR_TRAFFIC_MUTATION = gql`
  mutation MobileClearEndpointTraffic($endpointId: ID!) {
    clearEndpointTraffic(endpointId: $endpointId)
  }
`;

type EndpointTrafficData = {
  endpointTraffic?: EndpointTrafficEntry[] | null;
};

function displayStatus(status: string | null | undefined): string {
  if (!status) return "Unknown";
  return `${status[0]?.toUpperCase()}${status.slice(1)}`;
}

export function EndpointTrafficSheetContent({
  endpointId,
}: {
  groupId: string;
  endpointId?: string;
}) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topInset = insets.top + theme.spacing.sm;
  const endpoint = useEntityStore((s) =>
    endpointId ? (s.sessionEndpoints[endpointId] as SessionEndpoint | undefined) : undefined,
  );

  const [trafficEntries, setTrafficEntries] = useState<EndpointTrafficEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTraffic = useCallback(async (id: string) => {
    const result = await getClient()
      .query<EndpointTrafficData>(
        ENDPOINT_TRAFFIC_QUERY,
        { endpointId: id, limit: 100 },
        { requestPolicy: "network-only" },
      )
      .toPromise();
    if (result.error) throw result.error;
    setTrafficEntries(result.data?.endpointTraffic ?? []);
  }, []);

  useEffect(() => {
    if (!endpointId) {
      setTrafficEntries([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void loadTraffic(endpointId)
      .catch((trafficError) => {
        if (cancelled) return;
        setError(trafficError instanceof Error ? trafficError.message : "Failed to load traffic.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    const interval = setInterval(() => {
      void loadTraffic(endpointId).catch(() => undefined);
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [endpointId, loadTraffic]);

  const refresh = useCallback(() => {
    if (!endpointId) return;
    void loadTraffic(endpointId).catch((trafficError) =>
      setError(trafficError instanceof Error ? trafficError.message : "Failed to load traffic."),
    );
  }, [endpointId, loadTraffic]);

  const clearTraffic = useCallback(async () => {
    if (!endpointId) return;
    setPending(true);
    setError(null);
    try {
      const result = await getClient()
        .mutation(CLEAR_TRAFFIC_MUTATION, { endpointId })
        .toPromise();
      if (result.error) throw result.error;
      setTrafficEntries([]);
      void haptic.success();
    } catch (clearError) {
      void haptic.error();
      setError(clearError instanceof Error ? clearError.message : "Failed to clear traffic.");
    } finally {
      setPending(false);
    }
  }, [endpointId]);

  const headerBottom = topInset + HEADER_CONTENT_HEIGHT;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {loading ? (
        <View style={[styles.center, { paddingTop: headerBottom }]}>
          <TraceLoader size="small" color="mutedForeground" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: headerBottom + theme.spacing.sm,
              paddingBottom: insets.bottom + theme.spacing.xxl,
            },
          ]}
          scrollIndicatorInsets={{ top: headerBottom }}
        >
          {error ? (
            <View style={[styles.errorBox, { borderColor: theme.colors.destructive }]}>
              <Text variant="footnote" color="destructive">
                {error}
              </Text>
            </View>
          ) : null}
          {trafficEntries.length === 0 ? (
            <View style={styles.empty}>
              <EmptyState
                icon="network"
                title="No traffic captured"
                subtitle="Requests appear here after the endpoint receives traffic."
              />
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
              {trafficEntries.map((entry, index) => (
                <View key={entry.id}>
                  {index > 0 ? (
                    <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
                  ) : null}
                  <TrafficEntryRow entry={entry} />
                </View>
              ))}
            </View>
          )}
        </ScrollView>
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
      <View style={[styles.floatingHeader, { top: topInset, paddingHorizontal: theme.spacing.lg }]}>
        <GlassButton
          symbol="chevron.left"
          accessibilityLabel="Back"
          onPress={() => router.back()}
        />
        <View style={styles.headerTitle}>
          <Text variant="headline" numberOfLines={1}>
            {endpoint?.label ?? "Traffic"}
          </Text>
          <Text variant="caption2" color="dimForeground" numberOfLines={1}>
            {endpoint?.url || (endpoint ? displayStatus(endpoint.status) : "Endpoint traffic")}
          </Text>
        </View>
        <GlassButton
          symbol="arrow.clockwise"
          accessibilityLabel="Refresh traffic"
          disabled={!endpointId}
          onPress={refresh}
        />
        <GlassButton
          symbol="trash"
          accessibilityLabel="Clear traffic"
          tint="destructive"
          disabled={!endpointId || pending}
          onPress={() => void clearTraffic()}
        />
      </View>
    </View>
  );
}

function TrafficEntryRow({ entry }: { entry: EndpointTrafficEntry }) {
  const status = entry.responseStatus ?? (entry.error ? "ERR" : "...");
  return (
    <View style={styles.row}>
      <View style={styles.method}>
        <Text variant="caption2" color="mutedForeground">
          {new Date(entry.startedAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </Text>
        <Text variant="subheadline">{entry.requestMethod}</Text>
      </View>
      <View style={styles.path}>
        <Text variant="subheadline" numberOfLines={1}>
          {entry.requestPath}
        </Text>
        {entry.error ? (
          <Text variant="caption2" color="destructive" numberOfLines={1}>
            {entry.error}
          </Text>
        ) : null}
      </View>
      <View style={styles.statusCol}>
        <Text variant="subheadline" align="right">
          {String(status)}
        </Text>
        <Text variant="caption2" color="mutedForeground" align="right">
          {entry.durationMs != null ? `${entry.durationMs}ms` : "-"}
        </Text>
      </View>
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
    gap: 10,
    minHeight: HEADER_CONTENT_HEIGHT,
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
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
  empty: {
    paddingTop: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  errorBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    marginBottom: 12,
    padding: 12,
  },
  card: {
    borderRadius: 14,
    overflow: "hidden",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 14,
    opacity: 0.55,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  method: {
    width: 58,
  },
  path: {
    flex: 1,
    minWidth: 0,
  },
  statusCol: {
    width: 58,
  },
});
