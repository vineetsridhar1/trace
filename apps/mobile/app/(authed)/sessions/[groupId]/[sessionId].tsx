import { useCallback, useEffect } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEntityField } from "@trace/client-core";
import { SessionSurface } from "@/components/sessions/SessionSurface";
import {
  useEnsureSessionGroupDetail,
  useSessionGroupSessionIds,
} from "@/hooks/useSessionGroupDetail";

/**
 * Deep-link target for `trace://sessions/:groupId/:sessionId`. Renders the
 * same `SessionSurface` composition as the Session Player (§10.8); tab-strip
 * selections route via `router.replace` instead of updating the Player's
 * `overlaySessionId`.
 */
export default function SessionStreamScreen() {
  const { groupId, sessionId } = useLocalSearchParams<{
    groupId: string;
    sessionId: string;
  }>();
  const router = useRouter();
  useEnsureSessionGroupDetail(groupId);
  const sessionIds = useSessionGroupSessionIds(groupId);
  const sessionName = useEntityField("sessions", sessionId, "name") as
    | string
    | null
    | undefined;

  useEffect(() => {
    if (!groupId || !sessionId || sessionIds.length === 0) return;
    if (sessionIds.includes(sessionId)) return;
    router.replace(`/sessions/${groupId}/${sessionIds[0]}`);
  }, [groupId, router, sessionId, sessionIds]);

  const handleSelectSession = useCallback(
    (nextId: string) => {
      router.replace(`/sessions/${groupId}/${nextId}`);
    },
    [groupId, router],
  );

  return (
    <>
      <Stack.Screen options={{ title: sessionName ?? "Session" }} />
      <SessionSurface sessionId={sessionId} onSelectSession={handleSelectSession} />
    </>
  );
}
