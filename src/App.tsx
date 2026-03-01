import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Workspace, Channel, ChannelType, LocalChannelConfig, MiddlePanelView, TicketStatus } from './types';
import { gql } from '@apollo/client';
import { WORKSPACE_FIELDS } from './graphql/fragments';
import { useUpdateWorkspaceStatusMutation, useDeleteWorkspaceMutation } from './__generated__/App.generated';
import { useWorkspaceSync } from './hooks/useWorkspaceSync';
import { useThreadSync } from './hooks/useThreadSync';
import { usePanelResize } from './hooks/usePanelResize';
import { useChannelSubscriptions } from './hooks/useChannelSubscriptionsV2';
import { useChannelMessageNotifications } from './hooks/useChannelMessageNotifications';
import { useTerminalInit } from './hooks/useTerminalInit';
import { useClaudeWorkspaceActions } from './hooks/useClaudeWorkspaceActions';
import { usePRPolling } from './hooks/usePRPolling';
import { useKanbanSync } from './hooks/useKanbanSync';
import { useAiChatSync } from './hooks/useAiChatSync';
import { ChannelProvider, useChannelContext } from './context/ChannelContext';
import { ChannelPanel } from './components/ChannelPanel';
import { ChannelTopBar } from './components/ChannelTopBar';
import { MessagePanel } from './components/MessagePanel';
import { ChannelSettingsModal } from './components/ChannelSettingsModal';
import { CreateChannelModal } from './components/CreateChannelModal';
import { CreateServerModal } from './components/CreateServerModal';
import { ServerRail } from './components/ServerRail';
import { AiChatPanel } from './components/AiChatPanel';

// Zustand stores
import { useWorkspaceStore } from './stores/workspaceStore';
import { useThreadStore } from './stores/threadStore';
import { useTerminalStore } from './stores/terminalStore';
import { useKanbanStore } from './stores/kanbanStore';
import { useAppUIStore } from './stores/appUIStore';
import { useClaudeRunStore } from './stores/claudeRunStore';

const GQL_UPDATE_WORKSPACE_STATUS = gql`
  mutation UpdateWorkspaceStatus($channelId: ID!, $workspaceId: ID!, $status: String!) {
    updateWorkspaceStatus(channelId: $channelId, workspaceId: $workspaceId, status: $status) {
      ...WorkspaceFields
    }
  }
  ${WORKSPACE_FIELDS}
`;

const GQL_DELETE_WORKSPACE = gql`
  mutation DeleteWorkspace($channelId: ID!, $workspaceId: ID!) {
    deleteWorkspace(channelId: $channelId, workspaceId: $workspaceId)
  }
`;

export default function App() {
  return (
    <ChannelProvider>
      <AppContent />
    </ChannelProvider>
  );
}

function AppContent() {
  const {
    servers,
    activeServerId,
    activeServer,
    switchServer,
    refreshServers,
    enrichedChannels,
    serverChannels,
    activeChannelId,
    enrichedActiveChannel,
    switchChannel,
    refreshChannels,
    localConfigs,
    getLocalConfig,
    setLocalConfig,
    updateChannelSettings,
    deleteChannel,
  } = useChannelContext();

  // ─── Zustand store state ───────────────────────────────────────────
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const attentionWorkspaceIds = useWorkspaceStore((s) => s.attentionWorkspaceIds);
  const worktreeWorkspaceIds = useWorkspaceStore((s) => s.worktreeWorkspaceIds);
  const deletingWorktreeIds = useWorkspaceStore((s) => s.deletingWorktreeIds);

  const selectedWorkspaceId = useThreadStore((s) => s.selectedWorkspaceId);

  const workspacesWithRunningProcesses = useTerminalStore((s) => s.workspacesWithRunningProcesses);

  const kanbanColumns = useKanbanStore((s) => s.columns);
  const kanbanLoading = useKanbanStore((s) => s.loading);

  const middlePanelView = useAppUIStore((s) => s.middlePanelView);
  const channelWidth = useAppUIStore((s) => s.channelWidth);
  const isFullscreen = useAppUIStore((s) => s.isFullscreen);
  const settingsChannelId = useAppUIStore((s) => s.settingsChannelId);
  const createChannelType = useAppUIStore((s) => s.createChannelType);
  const showCreateServer = useAppUIStore((s) => s.showCreateServer);
  const activeAiChatId = useAppUIStore((s) => s.activeAiChatId);
  const aiChats = useAppUIStore((s) => s.aiChats);
  const dragging = useAppUIStore((s) => s.dragging);

  const activeRunWorkspaceIds = useClaudeRunStore((s) => s.activeRunWorkspaceIds);

  // ─── Stable channel ref for callbacks ──────────────────────────────
  const activeChannelRef = useRef<Channel | null>(null);
  activeChannelRef.current = enrichedActiveChannel;

  const getChannelRepoPath = useCallback(() => activeChannelRef.current?.localRepoPath ?? '', []);
  const getChannelBaseBranch = useCallback(() => activeChannelRef.current?.baseBranch ?? 'main', []);
  const getActiveChannelId = useCallback(() => activeChannelId, [activeChannelId]);

  // ─── Bridge hooks (GraphQL → stores) ──────────────────────────────
  const { refreshWorkspaces } = useWorkspaceSync();
  const { fetchBoard, moveTicket } = useKanbanSync();
  const { fetchAiChats, createAiChat, deleteAiChat: deleteAiChatMutation } = useAiChatSync();

  // Thread sync — registers sync actions on threadStore
  useThreadSync(getActiveChannelId, getChannelRepoPath, getChannelBaseBranch);

  // Terminal PTY exit listener
  useTerminalInit();

  // ─── Panel resize ─────────────────────────────────────────────────
  usePanelResize();

  // ─── Mutations ────────────────────────────────────────────────────
  const [executeUpdateWorkspaceStatus] = useUpdateWorkspaceStatusMutation();
  const [executeDeleteWorkspace] = useDeleteWorkspaceMutation();

  // ─── Notification permission ──────────────────────────────────────
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

  // ─── Upsert + sync helper ─────────────────────────────────────────
  const upsertAndSyncWorkspace = useCallback(
    (workspace: Workspace) => {
      useWorkspaceStore.getState().upsertWorkspace(workspace);
      useThreadStore.getState().syncSelectedWorkspace(workspace);
    },
    [],
  );

  // ─── Check worktree existence for merged workspaces ───────────────
  useEffect(() => {
    const repoPath = getChannelRepoPath();
    if (!repoPath || !window.traceAPI?.checkWorktreeExists) return;

    const mergedWorkspaces = workspaces.filter((ws) => ws.status === 'merged');
    if (mergedWorkspaces.length === 0) {
      const prev = useWorkspaceStore.getState().worktreeWorkspaceIds;
      if (prev.size > 0) useWorkspaceStore.getState().setWorktreeWorkspaceIds(new Set());
      return;
    }

    let cancelled = false;
    void (async () => {
      const ids = new Set<string>();
      for (const ws of mergedWorkspaces) {
        try {
          const result = await window.traceAPI.checkWorktreeExists(ws.id, repoPath);
          if (result.success && result.exists) ids.add(ws.id);
        } catch { /* ignore */ }
      }
      if (!cancelled) useWorkspaceStore.getState().setWorktreeWorkspaceIds(ids);
    })();

    return () => { cancelled = true; };
  }, [workspaces, getChannelRepoPath]);

  // ─── Attention / notifications ────────────────────────────────────
  const handleNeedsAttention = useCallback(
    (workspaceId: string, reason: 'stopped' | 'ask-user-question' | 'completed' | 'merged' | 'needs_input') => {
      useWorkspaceStore.getState().addAttention(workspaceId);

      if (!document.hasFocus() && 'Notification' in window && Notification.permission === 'granted') {
        const NOTIFICATION_TITLES: Record<string, string> = {
          'ask-user-question': 'Input needed',
          'needs_input': 'Input needed',
          'merged': 'Branch merged',
        };
        const title = NOTIFICATION_TITLES[reason] ?? 'Chat completed';
        const workspace = useWorkspaceStore.getState().workspaces.find((item) => item.id === workspaceId);
        const body = workspace?.preview || workspace?.cliSession.cwd || workspaceId;
        const notification = new Notification(title, { body });
        notification.onclick = () => { void window.traceAPI.focusWindow(); };
      }
    },
    [],
  );

  // ─── Update workspace status mutation ─────────────────────────────
  const updateWorkspaceStatus = useCallback(
    async (workspaceId: string, status: TicketStatus) => {
      if (!activeChannelId) return;
      try {
        const { data } = await executeUpdateWorkspaceStatus({
          variables: { channelId: activeChannelId, workspaceId, status },
        });
        if (!data) return;
        upsertAndSyncWorkspace(data.updateWorkspaceStatus as Workspace);
      } catch {
        console.error('Failed to update workspace status');
      }
    },
    [activeChannelId, executeUpdateWorkspaceStatus, upsertAndSyncWorkspace],
  );

  // ─── PR polling ──────────────────────────────────────────────────
  const workspacesRef = useRef(workspaces);
  workspacesRef.current = workspaces;
  const { triggerCheck: triggerPRCheck } = usePRPolling({
    workspacesRef,
    getChannelId: getActiveChannelId,
    updateWorkspaceStatus,
  });

  // ─── Open workspace handler ───────────────────────────────────────
  const handleOpenWorkspace = useCallback(
    (workspace: Workspace) => {
      useThreadStore.getState().syncActions.openThreadPanel(workspace);
      useAppUIStore.getState().setMiddlePanelView('workspaces');
      useWorkspaceStore.getState().clearAttention(workspace.id);
    },
    [],
  );

  // ─── Claude workspace actions (registers on claudeRunStore) ───────
  useClaudeWorkspaceActions({ updateWorkspaceStatus, onWorkspaceCreated: handleOpenWorkspace });

  // ─── Subscriptions ───────────────────────────────────────────────
  const reportClaudeActivity = useCallback(
    (workspaceId: string, eventType: string, sessionId?: string) =>
      useThreadStore.getState().syncActions.reportClaudeActivity(workspaceId, eventType, sessionId),
    [],
  );

  const autoRunRef = useRef<((workspaceId: string, runConfig: unknown) => void) | null>(null);
  useEffect(() => {
    autoRunRef.current = (workspaceId: string, runConfig: unknown) => {
      const config = runConfig as { prompt: string; model: string; effort: string; planMode: boolean };
      void useClaudeRunStore.getState().workspaceActions.autoRunQueuedTicket(workspaceId, config);
    };
  }, []);

  const { subscriptionsActive } = useChannelSubscriptions({
    activeChannelId,
    reportClaudeActivity,
    onNeedsAttention: handleNeedsAttention,
    onTicketReadyToRun: useCallback((workspaceId: string, runConfig: unknown) => {
      autoRunRef.current?.(workspaceId, runConfig);
    }, []),
    onWorkspaceCompleted: triggerPRCheck,
    refreshWorkspaces,
  });

  const { unreadCounts } = useChannelMessageNotifications({
    activeServerId,
    activeChannelId,
    activeAiChatId,
    serverChannels,
  });

  // ─── Channel/view switching ──────────────────────────────────────
  const handleSetView = useCallback(
    (view: MiddlePanelView) => {
      useAppUIStore.getState().setMiddlePanelView(view);
      if (view === 'board' && activeChannelId) void fetchBoard(activeChannelId);
    },
    [activeChannelId, fetchBoard],
  );

  const handleMoveTicket = useCallback(
    (ticketId: string, columnId: string, sortOrder: number) => {
      if (!activeChannelId) return;
      void moveTicket(activeChannelId, ticketId, columnId, sortOrder);
    },
    [activeChannelId, moveTicket],
  );

  const handleDeleteWorkspace = useCallback(
    async (workspaceId: string) => {
      if (!activeChannelId) return;
      if (!window.confirm('Delete this workspace?')) return;

      if (useThreadStore.getState().selectedWorkspaceId === workspaceId) {
        useThreadStore.getState().closeThreadPanel();
      }

      try {
        await executeDeleteWorkspace({ variables: { channelId: activeChannelId, workspaceId } });
        useWorkspaceStore.getState().removeWorkspace(workspaceId);
        useTerminalStore.getState().killAllForWorkspace(workspaceId);
        void window.traceAPI.releasePorts(workspaceId);
        void window.traceAPI.deleteWorktree(workspaceId, getChannelRepoPath());
      } catch {
        console.error('Failed to delete workspace');
      }
    },
    [activeChannelId, executeDeleteWorkspace, getChannelRepoPath],
  );

  const handleSwitchChannel = useCallback(
    (channelId: string) => {
      const currentSelected = useThreadStore.getState().selectedWorkspaceId;
      if (currentSelected) void window.traceAPI.releasePorts(currentSelected);
      useAppUIStore.getState().setActiveAiChatId(null);
      switchChannel(channelId);
      useWorkspaceStore.getState().clearWorkspaces();
      useKanbanStore.getState().clearBoard();
      useAppUIStore.getState().setMiddlePanelView('chat');
      useThreadStore.getState().closeThreadPanel();
      useAppUIStore.getState().setChannelWidth(220);
      useTerminalStore.getState().detachAll();
    },
    [switchChannel],
  );

  const handleSwitchServer = useCallback(
    (serverId: string) => {
      if (serverId === activeServerId) {
        useAppUIStore.getState().setChannelWidth(useAppUIStore.getState().channelWidth > 0 ? 0 : 220);
        return;
      }
      switchServer(serverId);
      useAppUIStore.getState().setChannelWidth(220);
      const firstChannel = enrichedChannels.find((ch) => ch.serverId === serverId);
      if (firstChannel) handleSwitchChannel(firstChannel.id);
    },
    [switchServer, enrichedChannels, handleSwitchChannel, activeServerId],
  );

  const handleSwitchAiChat = useCallback(
    (chatId: string) => {
      useAppUIStore.getState().setActiveAiChatId(chatId);
      useThreadStore.getState().closeThreadPanel();
      useAppUIStore.getState().setChannelWidth(220);
    },
    [],
  );

  const handleCreateAiChat = useCallback(async () => {
    if (!activeServerId) return;
    try {
      const chat = await createAiChat(activeServerId);
      if (chat) {
        useAppUIStore.getState().setActiveAiChatId(chat.id);
        useThreadStore.getState().closeThreadPanel();
        useAppUIStore.getState().setChannelWidth(220);
      }
    } catch (err) {
      console.error('[App] handleCreateAiChat failed:', err);
    }
  }, [activeServerId, createAiChat]);

  const handleDeleteAiChat = useCallback(
    async (id: string) => {
      await deleteAiChatMutation(id);
      if (useAppUIStore.getState().activeAiChatId === id) {
        useAppUIStore.getState().setActiveAiChatId(null);
      }
    },
    [deleteAiChatMutation],
  );

  const handleDeleteWorktreeById = useCallback(
    async (workspaceId: string) => {
      const repoPath = getChannelRepoPath();
      if (!repoPath) return;

      const confirmed = window.confirm('Delete this worktree? This removes local files for this workspace.');
      if (!confirmed) return;

      useTerminalStore.getState().killAllForWorkspace(workspaceId);
      void window.traceAPI.releasePorts(workspaceId);
      useWorkspaceStore.getState().addDeletingWorktreeId(workspaceId);

      try {
        const result = await window.traceAPI.deleteWorktree(workspaceId, repoPath);
        if (!result.success) {
          console.error('Failed to delete worktree:', result.error);
          return;
        }
        useWorkspaceStore.getState().removeWorktreeWorkspaceId(workspaceId);
        if (workspaceId === useThreadStore.getState().selectedWorkspaceId) {
          useThreadStore.getState().setHasWorktree(false);
        }
      } catch (err) {
        console.error('Failed to delete worktree:', err);
      } finally {
        useWorkspaceStore.getState().removeDeletingWorktreeId(workspaceId);
      }
    },
    [getChannelRepoPath],
  );

  // ─── Channel-switch effects ──────────────────────────────────────
  useEffect(() => {
    if (activeChannelId) {
      void refreshWorkspaces(activeChannelId);
      void fetchBoard(activeChannelId);
      useTerminalStore.getState().reattach();
    }
  }, [activeChannelId, refreshWorkspaces, fetchBoard]);

  useEffect(() => {
    if (activeServerId) void fetchAiChats(activeServerId);
  }, [activeServerId, fetchAiChats]);

  // Fallback polling when subscriptions are down
  useEffect(() => {
    const interval = setInterval(() => {
      if (!activeChannelId || subscriptionsActive) return;
      void refreshWorkspaces(activeChannelId);
      const selectedWs = useThreadStore.getState().selectedWorkspace;
      if (selectedWs) void useThreadStore.getState().syncActions.loadSessionEvents(selectedWs);
    }, 3000);
    return () => clearInterval(interval);
  }, [activeChannelId, refreshWorkspaces, subscriptionsActive]);

  // Sync terminal selection with workspace selection, killing idle PTYs on navigate away
  const prevTerminalWorkspaceRef = useRef<string | null>(null);
  useEffect(() => {
    const prevId = prevTerminalWorkspaceRef.current;
    prevTerminalWorkspaceRef.current = selectedWorkspaceId;
    if (prevId && prevId !== selectedWorkspaceId) {
      void useTerminalStore.getState().killIdleForWorkspace(prevId);
    }
    useTerminalStore.getState().selectWorkspace(selectedWorkspaceId);
  }, [selectedWorkspaceId]);

  // Keyboard shortcut: Cmd+T for new terminal
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 't' && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        useTerminalStore.getState().addTerminal();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ─── Settings / channel modals ───────────────────────────────────
  const settingsChannel = useMemo(
    () => enrichedChannels.find((channel) => channel.id === settingsChannelId) ?? null,
    [enrichedChannels, settingsChannelId],
  );

  const handleOpenSettings = useCallback((channelId: string) => {
    useAppUIStore.getState().setSettingsChannelId(channelId);
  }, []);

  const handleSaveSettings = useCallback(
    async (
      channelData: { name?: string; workspacesEnabled?: boolean; teamIds?: string[]; defaultSetupScript?: string | null; defaultRunScript?: string | null },
      localCfg: LocalChannelConfig | null,
    ) => {
      if (!settingsChannelId) return;
      await updateChannelSettings(settingsChannelId, channelData);
      if (localCfg) await setLocalConfig(settingsChannelId, localCfg);
      void refreshChannels();
    },
    [refreshChannels, settingsChannelId, updateChannelSettings, setLocalConfig],
  );

  const handleDeleteChannel = useCallback(
    async (channelId: string) => {
      const success = await deleteChannel(channelId);
      if (!success) return;
      useAppUIStore.getState().setSettingsChannelId(null);
      if (activeChannelId === channelId) {
        const remaining = serverChannels.filter((ch) => ch.id !== channelId);
        if (remaining.length > 0) switchChannel(remaining[0].id);
      }
      void refreshChannels();
    },
    [deleteChannel, activeChannelId, serverChannels, switchChannel, refreshChannels],
  );

  // ─── Computed values ─────────────────────────────────────────────
  const displayChannel = enrichedActiveChannel ?? serverChannels[0] ?? null;
  const panelTitle = displayChannel ? `# ${displayChannel.name}` : '';

  const teamProjects = useMemo(
    () =>
      displayChannel?.type === 'team'
        ? serverChannels.filter((ch) => ch.type === 'project' && ch.teamIds.includes(displayChannel.id))
        : [],
    [displayChannel, serverChannels],
  );

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#1a1b26] text-[#c0caf5]">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {!isFullscreen && (
          <ServerRail
            servers={servers}
            activeServerId={activeServerId}
            onSwitchServer={handleSwitchServer}
            onCreateServer={() => useAppUIStore.getState().setShowCreateServer(true)}
          />
        )}

        <ChannelPanel
          channels={serverChannels}
          activeChannelId={activeChannelId}
          channelWidth={isFullscreen ? 0 : channelWidth}
          dragging={dragging}
          serverName={activeServer?.name}
          aiChats={aiChats}
          activeAiChatId={activeAiChatId}
          unreadCounts={unreadCounts}
          onSwitchChannel={handleSwitchChannel}
          onCreateTeam={() => useAppUIStore.getState().setCreateChannelType('team')}
          onCreateProject={() => useAppUIStore.getState().setCreateChannelType('project')}
          onCreateChannel={() => useAppUIStore.getState().setCreateChannelType('channel')}
          onSwitchAiChat={handleSwitchAiChat}
          onCreateAiChat={() => { void handleCreateAiChat(); }}
          onDeleteAiChat={(id) => { void handleDeleteAiChat(id); }}
          onStartDrag={() => useAppUIStore.getState().setDragging('left')}
        />

        <div
          className="flex min-h-0 min-w-0 flex-col panel-animate"
          style={{ flex: '1 1 0%', overflow: 'hidden' }}
        >
          {!isFullscreen && !activeAiChatId && (
            <ChannelTopBar
              panelTitle={panelTitle}
              channelType={(displayChannel?.type ?? 'project') as ChannelType}
              workspacesEnabled={displayChannel?.workspacesEnabled ?? true}
              middlePanelView={middlePanelView}
              onSetView={handleSetView}
              onOpenSettings={() => { if (displayChannel) handleOpenSettings(displayChannel.id); }}
            />
          )}
          <div className="flex min-h-0 flex-1 flex-col">
            {activeAiChatId ? (
              <AiChatPanel
                chatId={activeAiChatId}
                chatTitle={aiChats.find((c) => c.id === activeAiChatId)?.title ?? 'AI Chat'}
              />
            ) : (
              <MessagePanel
                panelTitle={panelTitle}
                channelId={activeChannelId}
                channelCreatedAt={enrichedActiveChannel?.createdAt ?? null}
                workspaces={workspaces}
                selectedWorkspaceId={selectedWorkspaceId}
                attentionWorkspaceIds={attentionWorkspaceIds}
                onOpenWorkspace={handleOpenWorkspace}
                onDeleteWorkspace={handleDeleteWorkspace}
                onDeleteWorktree={handleDeleteWorktreeById}
                worktreeWorkspaceIds={worktreeWorkspaceIds}
                deletingWorktreeIds={deletingWorktreeIds}
                middlePanelView={middlePanelView}
                kanbanColumns={kanbanColumns}
                kanbanLoading={kanbanLoading}
                onMoveTicket={handleMoveTicket}
                isFullscreen={isFullscreen}
                teamProjects={teamProjects}
                onSwitchChannel={handleSwitchChannel}
                workspacesWithRunningProcesses={workspacesWithRunningProcesses}
                activeRunWorkspaceIds={activeRunWorkspaceIds}
              />
            )}
          </div>
        </div>
      </div>

      {settingsChannel && (
        <ChannelSettingsModal
          channel={settingsChannel}
          teams={serverChannels.filter((ch) => ch.type === 'team')}
          localConfig={getLocalConfig(settingsChannel.id)}
          onClose={() => useAppUIStore.getState().setSettingsChannelId(null)}
          onSave={handleSaveSettings}
          onDelete={handleDeleteChannel}
        />
      )}

      {createChannelType && (
        <CreateChannelModal
          serverId={activeServerId}
          channelType={createChannelType}
          teams={serverChannels.filter((ch) => ch.type === 'team')}
          onClose={() => useAppUIStore.getState().setCreateChannelType(null)}
          onCreated={() => {
            useAppUIStore.getState().setCreateChannelType(null);
            void refreshChannels();
          }}
          onLocalConfigSave={setLocalConfig}
        />
      )}

      {showCreateServer && (
        <CreateServerModal
          onClose={() => useAppUIStore.getState().setShowCreateServer(false)}
          onCreated={(server) => {
            useAppUIStore.getState().setShowCreateServer(false);
            void refreshServers();
            void refreshChannels();
            switchServer(server.id);
            if (server.channels.length > 0) handleSwitchChannel(server.channels[0].id);
          }}
        />
      )}
    </div>
  );
}
