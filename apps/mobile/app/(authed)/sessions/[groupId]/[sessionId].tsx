import { useCallback, useEffect, useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useEntityField } from "@trace/client-core";
import { Spinner } from "@/components/design-system";
import { SessionGroupHeader } from "@/components/sessions/SessionGroupHeader";
import { SessionStream } from "@/components/sessions/SessionStream";
import { SessionTabStrip } from "@/components/sessions/SessionTabStrip";
import {
  useEnsureSessionGroupDetail,
  useSessionGroupSessionIds,
} from "@/hooks/useSessionGroupDetail";
import { useTheme } from "@/theme";
import { useMobileUIStore } from "@/stores/ui";

const SOLID_HEADER_THRESHOLD = 8;

export default function SessionStreamScreen() {
  const { groupId, sessionId } = useLocalSearchParams<{
    groupId: string;
    sessionId: string;
  }>();
  const router = useRouter();
  const theme = useTheme();
  const loading = useEnsureSessionGroupDetail(groupId);
  const sessionIds = useSessionGroupSessionIds(groupId);
  const groupName = useEntityField("sessionGroups", groupId, "name") as string | null | undefined;
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

  const handleScrollOffsetChange = useCallback((offsetY: number) => {
    const next = offsetY > SOLID_HEADER_THRESHOLD;
    setSolidHeader((current) => (current === next ? current : next));
  }, []);

  if (loading && !groupName) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.colors.background }]}>
        <Spinner size="small" color="mutedForeground" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: sessionName ?? "Session" }} />
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <SessionGroupHeader groupId={groupId} solid={solidHeader} />
        <SessionTabStrip
          groupId={groupId}
          activeSessionId={sessionId}
          sessionIds={sessionIds}
        />
        <SessionStream sessionId={sessionId} onScrollOffsetChange={handleScrollOffsetChange} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  root: {
    flex: 1,
  },
});
