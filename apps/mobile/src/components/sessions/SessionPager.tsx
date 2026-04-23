import { useCallback, useRef } from "react";
import { StyleSheet, View } from "react-native";
import PagerView from "react-native-pager-view";
import { useEntityField } from "@trace/client-core";
import type { Repo } from "@trace/gql";
import { BrowserPanel } from "@/components/sessions/BrowserPanel";
import { SessionSurface, SessionSurfaceEmpty } from "@/components/sessions/SessionSurface";
import { useMobileUIStore } from "@/stores/ui";

interface SessionPagerProps {
  sessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  hideHeader?: boolean;
  topInset?: number;
  loadStreamEvents?: boolean;
  commitStreamEvents?: boolean;
  renderStreamEvents?: boolean;
}

/**
 * Two-page horizontal pager:
 *   Page 0 — BrowserPanel (embedded WebView)
 *   Page 1 — SessionSurface (the session stream)
 *
 * The user swipes right to reveal the browser, left to return to the session.
 * The PagerView's own scroll gesture is restricted to horizontal movement so
 * the Session Player's vertical dismiss gesture remains unaffected.
 */
export function SessionPager({
  sessionId,
  onSelectSession,
  hideHeader,
  topInset,
  loadStreamEvents,
  commitStreamEvents,
  renderStreamEvents,
}: SessionPagerProps) {
  const pagerRef = useRef<PagerView>(null);
  const browserUrl = useMobileUIStore((s) => s.browserUrl);

  // Derive initial browser URL: prefer stored URL, fall back to the session
  // group's PR URL, then the repo's remote URL.
  const groupId = useEntityField(
    "sessions",
    sessionId ?? "",
    "sessionGroupId",
  ) as string | null | undefined;
  const prUrl = useEntityField("sessionGroups", groupId ?? "", "prUrl") as
    | string
    | null
    | undefined;
  // The entity store stores repo as a nested object on sessionGroups (from the
  // GQL shape `repo: Repo`). Read it directly and extract remoteUrl.
  const repo = useEntityField("sessionGroups", groupId ?? "", "repo") as
    | Repo
    | null
    | undefined;
  const remoteUrl = repo?.remoteUrl ?? null;

  // Build a browser-friendly URL from the remote git URL when no PR exists yet.
  // e.g. git@github.com:org/repo.git  →  https://github.com/org/repo
  const gitToHttps = useCallback((gitUrl: string): string => {
    // SSH format: git@github.com:owner/repo.git
    const sshMatch = gitUrl.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
    if (sshMatch) return `https://${sshMatch[1]}/${sshMatch[2]}`;
    // Already https or http
    if (/^https?:\/\//.test(gitUrl)) return gitUrl.replace(/\.git$/, "");
    return gitUrl;
  }, []);

  const initialUrl =
    browserUrl ??
    (prUrl || (remoteUrl ? gitToHttps(remoteUrl) : ""));

  const handlePageSelected = useCallback(
    (e: { nativeEvent: { position: number } }) => {
      // Store the active pager page so SessionPlayerOverlay can read it if needed.
      useMobileUIStore.getState().setBrowserPanelActive(e.nativeEvent.position === 0);
    },
    [],
  );

  return (
    <PagerView
      ref={pagerRef}
      style={styles.pager}
      initialPage={1}
      orientation="horizontal"
      onPageSelected={handlePageSelected}
      // overdrag gives a subtle bounce cue at both ends
      overdrag
    >
      {/* Page 0: browser */}
      <View key="browser" style={styles.page}>
        <BrowserPanel initialUrl={initialUrl} topInset={topInset} />
      </View>

      {/* Page 1: session stream */}
      <View key="session" style={styles.page}>
        {sessionId ? (
          <SessionSurface
            sessionId={sessionId}
            onSelectSession={onSelectSession}
            hideHeader={hideHeader}
            topInset={topInset}
            loadStreamEvents={loadStreamEvents}
            commitStreamEvents={commitStreamEvents}
            renderStreamEvents={renderStreamEvents}
          />
        ) : (
          <SessionSurfaceEmpty />
        )}
      </View>
    </PagerView>
  );
}

const styles = StyleSheet.create({
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
});
