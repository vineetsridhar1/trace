import { useCallback, useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
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
import { getSessionChannelId, getSessionGroupChannelId } from "../../lib/session-group";
import { GroupHeader } from "./GroupHeader";
import { GroupTabStrip } from "./GroupTabStrip";
import type { OpenFileTab } from "./GroupTabStrip";
import { SessionDetailView } from "./SessionDetailView";
import { TerminalInstance } from "./TerminalInstance";
import { FileExplorer } from "./FileExplorer";
import { FileOpenContext } from "./FileOpenContext";
import { MonacoFileViewer } from "./MonacoFileViewer";
import {
  getSessionGroupDisplayStatus,
  isTerminalStatus,
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
  const [showFiles, setShowFiles] = useState(false);
  const [openFiles, setOpenFiles] = useState<OpenFileTab[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const addTerminal = useTerminalStore((s) => s.addTerminal);
  const removeTerminal = useTerminalStore((s) => s.removeTerminal);

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

  // Fetch full group detail and merge into store
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

  // Auto-select the most recent session if none is selected
  useEffect(() => {
    if (activeSessionGroupId !== sessionGroupId) return;
    if (sessionsByRecency.length === 0) return;
    if (activeSessionId && sessionsByRecency.some((session) => session.id === activeSessionId)) return;
    setActiveSessionId(sessionsByRecency[0].id);
  }, [activeSessionGroupId, activeSessionId, sessionGroupId, sessionsByRecency, setActiveSessionId]);

  // Clear terminal selection if the terminal was removed
  useEffect(() => {
    if (!activeTerminalId) return;
    if (terminals.some((terminal) => terminal.id === activeTerminalId)) return;
    setActiveTerminalId(null);
  }, [activeTerminalId, terminals, setActiveTerminalId]);

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
      if (existing.length > 0) return existing;

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
        },
      })
      .toPromise();

    const newSessionId = result.data?.startSession?.id;
    if (newSessionId) {
      setActiveSessionId(newSessionId);
    }
  }, [groupSessions, groupBranch, groupRepo, selectedSession, sessionGroupId, setActiveSessionId]);

  const handleSelectTerminal = useCallback(
    (sessionId: string | null, terminalId: string) => {
      if (sessionId) setActiveSessionId(sessionId);
      setActiveTerminalId(terminalId);
      setActiveFilePath(null);
    },
    [setActiveSessionId, setActiveTerminalId],
  );

  const handleFileClick = useCallback((filePath: string) => {
    setOpenFiles((prev) => {
      if (prev.some((f) => f.filePath === filePath)) return prev;
      const fileName = filePath.split("/").pop() ?? filePath;
      return [...prev, { filePath, fileName }];
    });
    setActiveFilePath(filePath);
    setActiveTerminalId(null);
  }, [setActiveTerminalId]);

  const handleSelectFile = useCallback((filePath: string) => {
    setActiveFilePath(filePath);
    setActiveTerminalId(null);
  }, [setActiveTerminalId]);

  const handleCloseFile = useCallback((filePath: string) => {
    setOpenFiles((prev) => prev.filter((f) => f.filePath !== filePath));
    setActiveFilePath((prev) => prev === filePath ? null : prev);
  }, []);

  const handleSelectSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
    setActiveTerminalId(null);
    setActiveFilePath(null);
  }, [setActiveSessionId, setActiveTerminalId]);

  return (
    <FileOpenContext.Provider value={handleFileClick}>
    <div className="flex h-full flex-col overflow-hidden">
      <GroupHeader
        groupName={groupName as string | undefined}
        selectedStatus={selectedStatus}
        selectedSessionId={selectedSession?.id ?? null}
        groupPrUrl={groupPrUrl}
        panelMode={panelMode}
        isFullscreen={isFullscreen}
        terminalAllowed={terminalAllowed}
        showFiles={showFiles}
        onClose={() => setActiveSessionId(null)}
        onNewChat={handleNewChat}
        onOpenTerminal={handleOpenTerminal}
        onToggleFullscreen={toggleFullscreen}
        onToggleFiles={() => setShowFiles((v) => !v)}
      />

      <GroupTabStrip
        sessionTabs={sessionTabs}
        terminals={terminals}
        groupSessions={groupSessions}
        selectedSessionId={selectedSession?.id ?? null}
        activeTerminalId={activeTerminalId}
        openFiles={openFiles}
        activeFilePath={activeFilePath}
        onSelectSession={handleSelectSession}
        onSelectTerminal={handleSelectTerminal}
        onCloseTerminal={handleCloseTerminal}
        onSelectFile={handleSelectFile}
        onCloseFile={handleCloseFile}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {showFiles && (
          <div className="h-full w-[260px] shrink-0 border-r border-[#2d2d2d]">
            <FileExplorer sessionGroupId={sessionGroupId} onFileClick={handleFileClick} />
          </div>
        )}
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {activeFilePath ? (
            <div className="h-full">
              <MonacoFileViewer
                key={activeFilePath}
                sessionGroupId={sessionGroupId}
                filePath={activeFilePath}
              />
            </div>
          ) : activeTerminal ? (
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
    </div>
    </FileOpenContext.Provider>
  );
}
