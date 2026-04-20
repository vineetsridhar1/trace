import { useEffect, useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useEntityField } from "@trace/client-core";
import { Spinner, Text } from "@/components/design-system";
import { SessionGroupHeader } from "@/components/sessions/SessionGroupHeader";
import { SessionTabStrip } from "@/components/sessions/SessionTabStrip";
import {
  useEnsureSessionGroupDetail,
  useSessionGroupSessionIds,
} from "@/hooks/useSessionGroupDetail";
import { useTheme } from "@/theme";
import { useMobileUIStore } from "@/stores/ui";

export default function SessionStreamScreen() {
  const { groupId, sessionId } = useLocalSearchParams<{
    groupId: string;
    sessionId: string;
  }>();
  const router = useRouter();
  const theme = useTheme();
  const loading = useEnsureSessionGroupDetail(groupId);
  const sessionIds = useSessionGroupSessionIds(groupId);
  const groupName = useEntityField("sessionGroups", groupId, "name") as
    | string
    | null
    | undefined;
  const sessionName = useEntityField("sessions", sessionId, "name") as
    | string
    | null
    | undefined;
  const [solidHeader, setSolidHeader] = useState(false);

  useEffect(() => {
    const store = useMobileUIStore.getState();
    store.setActiveSessionGroupId(groupId);
    store.setActiveSessionId(sessionId);
    return () => {
      const current = useMobileUIStore.getState();
      if (current.activeSessionGroupId === groupId) current.setActiveSessionGroupId(null);
      if (current.activeSessionId === sessionId) current.setActiveSessionId(null);
    };
  }, [groupId, sessionId]);

  useEffect(() => {
    if (!groupId || !sessionId || sessionIds.length === 0) return;
    if (sessionIds.includes(sessionId)) return;
    router.replace(`/sessions/${groupId}/${sessionIds[0]}`);
  }, [groupId, router, sessionId, sessionIds]);

  if (loading && !groupName) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.colors.background }]}>
        <Spinner size="small" color="mutedForeground" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: groupName ?? sessionName ?? "Session" }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        contentInsetAdjustmentBehavior="automatic"
        scrollEventThrottle={16}
        onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          const next = event.nativeEvent.contentOffset.y > 8;
          setSolidHeader((current) => (current === next ? current : next));
        }}
      >
        <SessionGroupHeader groupId={groupId} solid={solidHeader} />
        <SessionTabStrip
          groupId={groupId}
          activeSessionId={sessionId}
          sessionIds={sessionIds}
        />
        <View
          style={[
            styles.placeholder,
            {
              minHeight: 560,
              paddingHorizontal: theme.spacing.lg,
              paddingVertical: theme.spacing.xl,
            },
          ]}
        >
          <Text variant="headline">Session stream placeholder</Text>
          <Text variant="body" color="mutedForeground" style={{ marginTop: theme.spacing.sm }}>
            Ticket 19 now provides the session-group shell, redirect, header, and sibling tab strip.
          </Text>
          <Text variant="body" color="mutedForeground" style={{ marginTop: theme.spacing.sm }}>
            Ticket 20 will replace this body with the virtualized session event stream for {sessionName ?? sessionId}.
          </Text>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: {
    justifyContent: "flex-start",
  },
});
