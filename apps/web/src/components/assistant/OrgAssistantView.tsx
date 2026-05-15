import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, MessageSquarePlus } from "lucide-react";
import type { Session } from "@trace/gql";
import { useAuthStore, useEntitiesByIds, useEntityIds, useEntityStore } from "@trace/client-core";
import { client } from "../../lib/urql";
import { SessionDetailView } from "../session/SessionDetailView";
import { Button } from "../ui/button";
import { TraceLoader } from "../ui/trace-loader";
import { OrgAssistantChatList } from "./OrgAssistantChatList";
import {
  CREATE_ORG_ASSISTANT_SESSION_MUTATION,
  ORG_ASSISTANT_SESSIONS_QUERY,
} from "./orgAssistantGraphql";

function assistantSessionIdFromPath(): string | null {
  const match = window.location.pathname.match(/^\/assistant\/([^/]+)/);
  return match?.[1] ?? null;
}

function pushAssistantSessionNav(sessionId: string): void {
  history.pushState(
    {
      channelId: null,
      sessionGroupId: null,
      sessionId: null,
      chatId: null,
      page: "assistant",
      assistantSessionId: sessionId,
      channelSubPage: null,
    },
    "",
    `/assistant/${sessionId}`,
  );
}

export function OrgAssistantView() {
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const sessionIds = useEntityIds(
    "sessions",
    (session) => session.kind === "org_assistant",
    (a, b) => {
      const aTime = a.lastMessageAt ?? a.updatedAt ?? a.createdAt;
      const bTime = b.lastMessageAt ?? b.updatedAt ?? b.createdAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    },
  );
  const sessions = useEntitiesByIds("sessions", sessionIds).filter(
    (session): session is Session => session !== null,
  );
  const [sessionId, setSessionId] = useState<string | null>(() => assistantSessionIdFromPath());
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === sessionId) ?? null,
    [sessionId, sessions],
  );

  const storeSessions = useCallback((nextSessions: Session[]) => {
    useEntityStore.getState().upsertMany("sessions", nextSessions);
  }, []);

  const selectSession = useCallback((nextSessionId: string) => {
    setSessionId(nextSessionId);
    pushAssistantSessionNav(nextSessionId);
  }, []);

  useEffect(() => {
    function handlePopState() {
      setSessionId(assistantSessionIdFromPath());
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!activeOrgId) return;
    setLoading(true);
    setError(null);
    client
      .query(ORG_ASSISTANT_SESSIONS_QUERY, { organizationId: activeOrgId })
      .toPromise()
      .then((result) => {
        if (result.error) {
          setError(result.error.message);
          return;
        }
        const queriedSessions = (result.data?.orgAssistantSessions ?? []) as Session[];
        const fallbackSession = result.data?.orgAssistantSession as Session | undefined;
        const nextSessions = queriedSessions.length > 0 ? queriedSessions : fallbackSession ? [fallbackSession] : [];
        storeSessions(nextSessions);

        const pathSessionId = assistantSessionIdFromPath();
        if (pathSessionId && nextSessions.some((session) => session.id === pathSessionId)) {
          setSessionId(pathSessionId);
          return;
        }
        if (nextSessions[0]) {
          setSessionId(nextSessions[0].id);
          history.replaceState(
            {
              channelId: null,
              sessionGroupId: null,
              sessionId: null,
              chatId: null,
              page: "assistant",
              assistantSessionId: nextSessions[0].id,
              channelSubPage: null,
            },
            "",
            `/assistant/${nextSessions[0].id}`,
          );
        }
      })
      .finally(() => setLoading(false));
  }, [activeOrgId, storeSessions]);

  const handleNewChat = useCallback(() => {
    if (!activeOrgId || creating) return;
    setCreating(true);
    setError(null);
    client
      .mutation(CREATE_ORG_ASSISTANT_SESSION_MUTATION, { organizationId: activeOrgId })
      .toPromise()
      .then((result) => {
        if (result.error) {
          setError(result.error.message);
          return;
        }
        const session = result.data?.createOrgAssistantSession as Session | undefined;
        if (!session) return;
        useEntityStore.getState().upsert("sessions", session.id, session);
        selectSession(session.id);
      })
      .finally(() => setCreating(false));
  }, [activeOrgId, creating, selectSession]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Bot className="size-4 text-primary" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">Org Assistant</div>
            {selectedSession ? (
              <div className="truncate text-xs text-muted-foreground">{selectedSession.name}</div>
            ) : null}
          </div>
        </div>
        <Button size="sm" onClick={handleNewChat} disabled={creating || !activeOrgId}>
          <MessageSquarePlus className="size-3.5" />
          New chat
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        <OrgAssistantChatList
          sessions={sessions}
          selectedSessionId={sessionId}
          onSelectSession={selectSession}
        />

        <div className="min-w-0 flex-1">
          {error ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-destructive">
              {error}
            </div>
          ) : sessionId ? (
            <SessionDetailView sessionId={sessionId} hideHeader />
          ) : loading ? (
            <div className="flex h-full items-center justify-center">
              <TraceLoader label="Opening assistant" size={48} />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
              Start a new assistant chat to ask about your organization.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
