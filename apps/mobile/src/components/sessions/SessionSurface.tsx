import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useEntityField } from "@trace/client-core";
import { Spinner, Text } from "@/components/design-system";
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

interface SessionSurfaceProps {
  sessionId: string;
  /** Called when the user taps a sibling session in the tab strip. */
  onSelectSession: (sessionId: string) => void;
}

/**
 * The complete session surface: group header + sibling tab strip + event
 * stream. Rendered both inside the Session Player (§10.8) and by the
 * deep-link stack route, so both paths land on the same composition.
 */
export function SessionSurface({ sessionId, onSelectSession }: SessionSurfaceProps) {
  const theme = useTheme();
  const groupId = useEntityField("sessions", sessionId, "sessionGroupId") as
    | string
    | null
    | undefined;
  const loading = useEnsureSessionGroupDetail(groupId ?? undefined);
  const sessionIds = useSessionGroupSessionIds(groupId ?? "");
  const groupName = useEntityField("sessionGroups", groupId ?? "", "name") as
    | string
    | null
    | undefined;
  const [solidHeader, setSolidHeader] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    const store = useMobileUIStore.getState();
    store.setActiveSessionGroupId(groupId);
    store.setActiveSessionId(sessionId);
    return () => {
      const current = useMobileUIStore.getState();
      if (current.activeSessionGroupId === groupId) current.setActiveSessionGroupId(null);
      if (current.activeSessionId === sessionId) current.setActiveSessionId(null);
    };
  }, [groupId, sessionId]);

  const handleScrollOffsetChange = useCallback((offsetY: number) => {
    const next = offsetY > SOLID_HEADER_THRESHOLD;
    setSolidHeader((current) => (current === next ? current : next));
  }, []);

  if (!groupId || (loading && !groupName)) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.colors.background }]}>
        <Spinner size="small" color="mutedForeground" />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <SessionGroupHeader groupId={groupId} solid={solidHeader} />
      <SessionTabStrip
        activeSessionId={sessionId}
        sessionIds={sessionIds}
        onSelect={onSelectSession}
      />
      <SessionStream sessionId={sessionId} onScrollOffsetChange={handleScrollOffsetChange} />
    </View>
  );
}

interface SessionSurfaceEmptyProps {
  message?: string;
}

export function SessionSurfaceEmpty({ message = "No session selected" }: SessionSurfaceEmptyProps) {
  const theme = useTheme();
  return (
    <View style={[styles.empty, { backgroundColor: theme.colors.background }]}>
      <Text variant="body" color="mutedForeground">
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  root: {
    flex: 1,
  },
});
