import { useCallback, useEffect, useMemo, useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEntityField } from "@trace/client-core";
import type { Repo } from "@trace/gql";
import { Pressable, StyleSheet, View } from "react-native";
import {
  EmptyState,
  IconButton,
  Screen,
  Spinner,
} from "@/components/design-system";
import { ActiveTodoStrip } from "@/components/sessions/ActiveTodoStrip";
import { BrowserPanel } from "@/components/sessions/BrowserPanel";
import { SessionGroupHeader } from "@/components/sessions/SessionGroupHeader";
import {
  SessionPageBottomNav,
  type SessionPageTab,
} from "@/components/sessions/SessionPageBottomNav";
import { SessionSurface } from "@/components/sessions/SessionSurface";
import { SessionTabStrip } from "@/components/sessions/SessionTabStrip";
import { SessionTerminalPanel } from "@/components/sessions/SessionTerminalPanel";
import { closeSessionPlayer } from "@/lib/sessionPlayer";
import { useMobileUIStore } from "@/stores/ui";
import { useTheme } from "@/theme";
import {
  useEnsureSessionGroupDetail,
  useSessionGroupSessionIds,
} from "@/hooks/useSessionGroupDetail";

/**
 * Standalone mobile session page. Reuses the session surface building blocks
 * but keeps the session, browser, and terminal views inside a dedicated page
 * with its own bottom navigation instead of the old sheet-style overlay.
 */
export default function SessionStreamScreen() {
  const { groupId, sessionId } = useLocalSearchParams<{
    groupId: string;
    sessionId: string;
  }>();
  const router = useRouter();
  const theme = useTheme();
  const loadingGroup = useEnsureSessionGroupDetail(groupId);
  const sessionIds = useSessionGroupSessionIds(groupId);
  const activeMenuClose = useMobileUIStore((s) => s.activeMenuClose);
  const hydratedGroupId =
    (useEntityField("sessions", sessionId, "sessionGroupId") as string | null | undefined)
    ?? groupId;
  const prUrl = useEntityField("sessionGroups", hydratedGroupId, "prUrl") as
    | string
    | null
    | undefined;
  const repo = useEntityField("sessionGroups", hydratedGroupId, "repo") as
    | Repo
    | null
    | undefined;
  const groupName = useEntityField("sessionGroups", hydratedGroupId, "name") as
    | string
    | null
    | undefined;
  const [activeTab, setActiveTab] = useState<SessionPageTab>("session");
  const defaultBrowserUrl = useMemo(() => {
    if (prUrl) return prUrl;
    const remoteUrl = repo?.remoteUrl;
    if (!remoteUrl) return "";
    const sshMatch = remoteUrl.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
    if (sshMatch) return `https://${sshMatch[1]}/${sshMatch[2]}`;
    if (/^https?:\/\//.test(remoteUrl)) return remoteUrl.replace(/\.git$/, "");
    return remoteUrl;
  }, [prUrl, repo?.remoteUrl]);
  const [browserUrl, setBrowserUrl] = useState(defaultBrowserUrl);

  useEffect(() => {
    if (!groupId || !sessionId || sessionIds.length === 0) return;
    if (sessionIds.includes(sessionId)) return;
    router.replace(`/sessions/${groupId}/${sessionIds[0]}`);
  }, [groupId, router, sessionId, sessionIds]);

  useEffect(() => {
    setActiveTab("session");
  }, [groupId]);

  useEffect(() => {
    setBrowserUrl(defaultBrowserUrl);
  }, [defaultBrowserUrl, hydratedGroupId]);

  const handleSelectSession = useCallback(
    (nextId: string) => {
      router.replace(`/sessions/${groupId}/${nextId}`);
    },
    [groupId, router],
  );

  const showLoading = loadingGroup || (sessionIds.length === 0 && !groupName);

  return (
    <Screen
      edges={["top", "left", "right"]}
      background="background"
      style={styles.root}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.headerStack}>
        <View style={[styles.backRow, { paddingHorizontal: theme.spacing.sm }]}>
          <IconButton
            symbol="chevron.left"
            onPress={closeSessionPlayer}
            accessibilityLabel="Back"
          />
        </View>

        {showLoading ? null : (
          <>
            <SessionGroupHeader groupId={hydratedGroupId} sessionId={sessionId} />
            <SessionTabStrip
              groupId={hydratedGroupId}
              activeSessionId={sessionId}
              onSelect={handleSelectSession}
            />
            <ActiveTodoStrip sessionId={sessionId} />
          </>
        )}
      </View>

      <View style={styles.content}>
        {showLoading ? (
          <View style={styles.center}>
            <Spinner size="small" color="mutedForeground" />
          </View>
        ) : sessionIds.length === 0 ? (
          <View style={styles.center}>
            <EmptyState
              icon="bolt.horizontal"
              title="No sessions in this workspace"
              subtitle="This workspace has not started a session yet."
            />
          </View>
        ) : activeTab === "session" ? (
          <SessionSurface
            sessionId={sessionId}
            onSelectSession={handleSelectSession}
            hideHeader
          />
        ) : activeTab === "browser" ? (
          <BrowserPanel url={browserUrl} onUrlChange={setBrowserUrl} />
        ) : (
          <SessionTerminalPanel sessionId={sessionId} />
        )}
      </View>

      <View style={styles.navWrap}>
        <SessionPageBottomNav activeTab={activeTab} onTabChange={setActiveTab} />
      </View>

      {activeMenuClose ? (
        <Pressable
          accessibilityLabel="Dismiss menu"
          onPress={activeMenuClose}
          style={styles.menuScrim}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "relative",
  },
  headerStack: {
    zIndex: 10,
  },
  backRow: {
    alignItems: "flex-start",
    paddingTop: 4,
  },
  content: {
    flex: 1,
    minHeight: 0,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  navWrap: {
    zIndex: 10,
  },
  menuScrim: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
});
