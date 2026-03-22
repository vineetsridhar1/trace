import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gql } from "@urql/core";
import {
  Circle,
  GitPullRequest,
  History,
  Maximize2,
  Minimize2,
  Plus,
  TerminalSquare,
  X,
} from "lucide-react";
import { client } from "../../lib/urql";
import {
  CREATE_TERMINAL_MUTATION,
  DESTROY_TERMINAL_MUTATION,
  SESSION_TERMINALS_QUERY,
  START_SESSION_MUTATION,
} from "../../lib/mutations";
import { useDetailPanelStore } from "../../stores/detail-panel";
import { useEntityField, useEntityStore } from "../../stores/entity";
import type { SessionEntity } from "../../stores/entity";
import { useAuthStore } from "../../stores/auth";
import { useTerminalStore, useSessionGroupTerminals } from "../../stores/terminal";
import { useUIStore } from "../../stores/ui";
import { cn } from "../../lib/utils";
import { getSessionChannelId, getSessionGroupChannelId } from "../../lib/session-group";
import { SessionDetailView } from "./SessionDetailView";
import { SessionHistory } from "./SessionHistory";
import { TerminalInstance } from "./TerminalInstance";
import {
  getDisplayStatus,
  getSessionGroupDisplayStatus,
  isTerminalStatus,
  statusColor,
  statusLabel,
} from "./sessionStatus";
import type { Terminal } from "@trace/gql";

const SESSION_GROUP_DETAIL_QUERY = gql`
  query SessionGroupDetail($id: ID!) {
    sessionGroup(id: $id) {
      id
      name
      branch
      prUrl
      workdir
      worktreeDeleted
      repo {
        id
        name
      }
      connection {
        state
        runtimeInstanceId
        runtimeLabel
        lastError
        retryCount
        canRetry
        canMove
      }
      channel {
        id
      }
      createdAt
      updatedAt
      sessions {
        id
        name
        status
        tool
        model
        hosting
        branch
        worktreeDeleted
        sessionGroupId
        connection {
          state
          runtimeInstanceId
          runtimeLabel
          lastError
          retryCount
          canRetry
          canMove
        }
        createdBy {
          id
          name
          avatarUrl
        }
        repo {
          id
          name
        }
        channel {
          id
        }
        createdAt
        updatedAt
      }
    }
  }
`;

export function SessionGroupDetailView({
  sessionGroupId,
  panelMode,
}: {
  sessionGroupId: string;
  panelMode?: boolean;
}) {
  const groupName = useEntityField("sessionGroups", sessionGroupId, "name");
  const groupRepo = useEntityField("sessionGroups", sessionGroupId, "repo") as
    | { id: string; name: string }
    | null
    | undefined;
  const groupBranch = useEntityField("sessionGroups", sessionGroupId, "branch") as string | null | undefined;
  const groupPrUrl = useEntityField("sessionGroups", sessionGroupId, "prUrl") as string | null | undefined;
  const groupConnection = useEntityField("sessionGroups", sessionGroupId, "connection") as
    | Record<string, unknown>
    | null
    | undefined;
  const groupWorktreeDeleted = useEntityField("sessionGroups", sessionGroupId, "worktreeDeleted") as
    | boolean
    | undefined;
  const activeSessionGroupId = useUIStore((s) => s.activeSessionGroupId);
  const activeSessionId = useUIStore((s) => s.activeSessionId);
  const activeTerminalId = useUIStore((s) => s.activeTerminalId);
  const setActiveSessionId = useUIStore((s) => s.setActiveSessionId);
  const setActiveTerminalId = useUIStore((s) => s.setActiveTerminalId);
  const toggleFullscreen = useDetailPanelStore((s) => s.toggleFullscreen);
  const isFullscreen = useDetailPanelStore((s) => s.isFullscreen);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const sessionsMap = useEntityStore((s) => s.sessions);
  const upsert = useEntityStore((s) => s.upsert);
  const upsertMany = useEntityStore((s) => s.upsertMany);
  const terminals = useSessionGroupTerminals(sessionGroupId);
  const addTerminal = useTerminalStore((s) => s.addTerminal);
  const removeTerminal = useTerminalStore((s) => s.removeTerminal);
  const [showHistory, setShowHistory] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

  const groupSessions = useMemo(
    () =>
      (Object.values(sessionsMap) as SessionEntity[]).filter(
        (session) => session.sessionGroupId === sessionGroupId,
      ),
    [sessionGroupId, sessionsMap],
  );

  const sessionsByRecency = useMemo(() => {
    return [...groupSessions].sort((a, b) => {
      const diff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      if (diff !== 0) return diff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [groupSessions]);

  const sessionTabs = useMemo(() => {
    return [...groupSessions].sort((a, b) => {
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id);
    });
  }, [groupSessions]);

  useEffect(() => {
    client
      .query(SESSION_GROUP_DETAIL_QUERY, { id: sessionGroupId })
      .toPromise()
      .then((result) => {
        if (!result.data?.sessionGroup) return;
        const fetchedGroup = result.data.sessionGroup;
        const existingGroup = useEntityStore.getState().sessionGroups[fetchedGroup.id];
        upsert(
          "sessionGroups",
          fetchedGroup.id,
          existingGroup ? { ...existingGroup, ...fetchedGroup } : fetchedGroup,
        );
        const fetchedSessions = fetchedGroup.sessions;
        if (Array.isArray(fetchedSessions)) {
          const existingSessions = useEntityStore.getState().sessions;
          upsertMany(
            "sessions",
            fetchedSessions.map((session) => ({
              ...(existingSessions[session.id] ?? {}),
              ...session,
            })) as Array<SessionEntity & { id: string }>,
          );
        }
      });
  }, [sessionGroupId, upsert, upsertMany]);

  useEffect(() => {
    if (activeSessionGroupId !== sessionGroupId) return;
    if (sessionsByRecency.length === 0) return;
    if (activeSessionId && sessionsByRecency.some((session) => session.id === activeSessionId)) return;
    setActiveSessionId(sessionsByRecency[0].id);
  }, [activeSessionGroupId, activeSessionId, sessionGroupId, sessionsByRecency, setActiveSessionId]);

  useEffect(() => {
    if (!activeTerminalId) return;
    if (terminals.some((terminal) => terminal.id === activeTerminalId)) return;
    setActiveTerminalId(null);
  }, [activeTerminalId, terminals, setActiveTerminalId]);

  useEffect(() => {
    if (!showHistory) return;

    function handleClick(event: MouseEvent) {
      if (historyRef.current && !historyRef.current.contains(event.target as Node)) {
        setShowHistory(false);
      }
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowHistory(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [showHistory]);

  const selectedSession = sessionTabs.find((session) => session.id === activeSessionId)
    ?? sessionsByRecency[0]
    ?? null;
  const activeTerminal = terminals.find((terminal) => terminal.id === activeTerminalId) ?? null;

  const selectedStatus = getSessionGroupDisplayStatus(
    groupSessions.map((session) => session.status),
    groupPrUrl,
  );
  const terminalAllowed = (() => {
    if (!selectedSession) return false;
    const hosting = selectedSession.hosting;
    const createdBy = selectedSession.createdBy as { id: string } | undefined;
    const isCloud = hosting === "cloud";
    const isLocalOwner = hosting === "local" && createdBy?.id === currentUserId;
    const isConnected = !groupConnection || groupConnection.state !== "disconnected";
    return (isCloud || isLocalOwner)
      && isConnected
      && !isTerminalStatus(selectedSession.status)
      && !groupWorktreeDeleted;
  })();

  const ensureSessionTerminals = useCallback(
    async (sessionId: string) => {
      const existing = terminals.filter((terminal) => terminal.sessionId === sessionId);
      if (existing.length > 0) {
        return existing;
      }

      const result = await client.query(SESSION_TERMINALS_QUERY, { sessionId }).toPromise();
      const restored = (result.data?.sessionTerminals as Terminal[] | undefined) ?? [];
      for (const terminal of restored) {
        if (!useTerminalStore.getState().terminals[terminal.id]) {
          addTerminal(terminal.id, terminal.sessionId, sessionGroupId, "active");
        }
      }
      return restored.map((terminal) => ({
        id: terminal.id,
        sessionId: terminal.sessionId,
        sessionGroupId,
        status: "active" as const,
      }));
    },
    [addTerminal, sessionGroupId, terminals],
  );

  const handleOpenTerminal = useCallback(async () => {
    if (!selectedSession || !terminalAllowed) return;
    const existing = await ensureSessionTerminals(selectedSession.id);
    if (existing.length > 0) {
      setActiveSessionId(selectedSession.id);
      setActiveTerminalId(existing[0].id);
      return;
    }

    const result = await client
      .mutation(CREATE_TERMINAL_MUTATION, { sessionId: selectedSession.id, cols: 80, rows: 24 })
      .toPromise();
    if (result.data?.createTerminal) {
      const { id } = result.data.createTerminal as { id: string };
      addTerminal(id, selectedSession.id, sessionGroupId);
      setActiveSessionId(selectedSession.id);
      setActiveTerminalId(id);
    }
  }, [
    addTerminal,
    ensureSessionTerminals,
    selectedSession,
    sessionGroupId,
    setActiveSessionId,
    setActiveTerminalId,
    terminalAllowed,
  ]);

  const handleCloseTerminal = useCallback(
    async (terminalId: string) => {
      removeTerminal(terminalId);
      if (activeTerminalId === terminalId) {
        setActiveTerminalId(null);
      }
      await client.mutation(DESTROY_TERMINAL_MUTATION, { terminalId }).toPromise();
    },
    [activeTerminalId, removeTerminal, setActiveTerminalId],
  );

  const handleNewChat = useCallback(async () => {
    if (!selectedSession) return;
    const resolvedChannelId =
      getSessionGroupChannelId(
        useEntityStore.getState().sessionGroups[sessionGroupId] ?? null,
        groupSessions,
      )
      ?? getSessionChannelId(selectedSession);
    const result = await client
      .mutation(START_SESSION_MUTATION, {
        input: {
          tool: selectedSession.tool,
          model: selectedSession.model ?? undefined,
          hosting: selectedSession.hosting,
          channelId: resolvedChannelId ?? undefined,
          repoId: groupRepo?.id ?? (selectedSession.repo as { id: string } | null | undefined)?.id,
          branch: groupBranch ?? selectedSession.branch ?? undefined,
          sessionGroupId,
          sourceSessionId: selectedSession.id,
        },
      })
      .toPromise();

    const newSessionId = result.data?.startSession?.id;
    if (newSessionId) {
      setActiveSessionId(newSessionId);
    }
  }, [groupSessions, groupBranch, groupRepo, selectedSession, sessionGroupId, setActiveSessionId]);

  const latestSessionLabel = selectedSession
    ? statusLabel[selectedStatus] ?? selectedStatus
    : null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2">
        <button
          onClick={() => setActiveSessionId(null)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
          title="Close panel"
        >
          <X size={16} />
        </button>

        {selectedSession && (
          <span className={cn("flex shrink-0 items-center gap-1.5 text-xs", statusColor[selectedStatus])}>
            <Circle size={6} className="fill-current" />
            {latestSessionLabel}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-foreground">
            {groupName ?? "Session Group"}
          </h2>
        </div>

        <button
          onClick={handleNewChat}
          disabled={!selectedSession}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground disabled:opacity-50"
          title="Start a new chat in this group"
        >
          <Plus size={14} />
          New Chat
        </button>

        <button
          onClick={handleOpenTerminal}
          disabled={!terminalAllowed}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground disabled:opacity-50"
          title="Open terminal"
        >
          <TerminalSquare size={14} />
        </button>

        <div className="relative" ref={historyRef}>
          <button
            onClick={() => setShowHistory((value) => !value)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
            title="Group history"
          >
            <History size={14} />
          </button>
          {showHistory && selectedSession && (
            <div className="absolute right-0 top-full z-50 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface shadow-lg">
              <SessionHistory sessionId={selectedSession.id} />
            </div>
          )}
        </div>

        {groupPrUrl && (
          <a
            href={groupPrUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
            title="View Pull Request"
          >
            <GitPullRequest size={14} />
          </a>
        )}

        {panelMode && (
          <button
            onClick={toggleFullscreen}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        )}
      </div>

      <div className="shrink-0 border-b border-border bg-surface px-2 py-1">
        <div className="overflow-x-auto">
          <div className="flex min-w-max items-center gap-1">
            {sessionTabs.map((session) => {
              const displayStatus = getDisplayStatus(session.status, null);
              return (
                <button
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  className={cn(
                    "inline-flex max-w-[220px] shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors",
                    !activeTerminalId && selectedSession?.id === session.id
                      ? "bg-surface-elevated text-foreground"
                      : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
                  )}
                >
                  <Circle size={6} className={cn("fill-current", statusColor[displayStatus])} />
                  <span className="truncate">{session.name}</span>
                </button>
              );
            })}

            {terminals.map((terminal, index) => {
              const session = groupSessions.find((candidate) => candidate.id === terminal.sessionId);
              const label = session ? `Terminal ${index + 1} · ${session.name}` : `Terminal ${index + 1}`;
              return (
                <div
                  key={terminal.id}
                  className={cn(
                    "inline-flex max-w-[260px] shrink-0 items-center rounded-md text-xs transition-colors",
                    activeTerminalId === terminal.id
                      ? "bg-surface-elevated text-foreground"
                      : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (session) {
                        setActiveSessionId(session.id);
                      }
                      setActiveTerminalId(terminal.id);
                    }}
                    className="inline-flex min-w-0 items-center gap-2 px-3 py-1.5"
                  >
                    <TerminalSquare size={12} />
                    <span className="truncate">{label}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleCloseTerminal(terminal.id);
                    }}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm opacity-60 transition-opacity hover:opacity-100"
                    title="Close terminal tab"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTerminal ? (
          <div className="h-full bg-[#0a0a0a]">
            <TerminalInstance terminalId={activeTerminal.id} visible />
          </div>
        ) : selectedSession ? (
          <SessionDetailView sessionId={selectedSession.id} hideHeader />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select a chat tab to continue.
          </div>
        )}
      </div>
    </div>
  );
}
