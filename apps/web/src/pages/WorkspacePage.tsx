import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { ConnectionStatusBar } from '../components/ConnectionStatusBar';
import { WebWorkspaceList } from '../components/WebWorkspaceList';
import { WebThreadPanel } from '../components/WebThreadPanel';
import { WebThreadInput } from '../components/WebThreadInput';
import { WebRunButtons } from '../components/WebRunButtons';
import { WebThreadHeader } from '../components/WebThreadHeader';
import { WebChannelSelector } from '../components/WebChannelSelector';
import { useChannelContext } from '../context/ChannelContext';
import { useInstanceStore } from '../stores/instanceStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useWorkspaceSync } from '../hooks/useWorkspaceSync';
import { useChannelSubscriptions } from '../hooks/useChannelSubscriptions';
import { useThreadSync } from '../hooks/useThreadSync';
import { useWorkspaceActions } from '../hooks/useWorkspaceActions';
import { useAuth } from '../context/AuthContext';

export function WorkspacePage() {
  const { instanceId } = useParams<{ instanceId: string }>();
  const connectedInstanceId = useInstanceStore((s) => s.connectedInstanceId);
  const instanceStatus = useInstanceStore((s) => s.instanceStatus);
  const { activeChannelId } = useChannelContext();

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);

  // Clear selected workspace when channel changes
  const prevChannelRef = useRef(activeChannelId);
  useEffect(() => {
    if (prevChannelRef.current !== activeChannelId) {
      prevChannelRef.current = activeChannelId;
      setSelectedWorkspaceId(null);
    }
  }, [activeChannelId]);

  const selectedWorkspace = useWorkspaceStore((s) =>
    s.workspaces.find((w) => w.id === selectedWorkspaceId) ?? null,
  );

  const isOffline = instanceStatus !== 'connected';
  const { user } = useAuth();
  const isOwnWorkspace = !selectedWorkspace || !selectedWorkspace.userId || selectedWorkspace.userId === user?.id;

  // Redirect if not connected to this instance
  if (instanceId !== connectedInstanceId) {
    return <Navigate to="/" replace />;
  }

  return (
    <WorkspacePageInner
      channelId={activeChannelId}
      selectedWorkspaceId={selectedWorkspaceId}
      selectedWorkspace={selectedWorkspace}
      isOffline={isOffline}
      isOwnWorkspace={isOwnWorkspace}
      onSelectWorkspace={setSelectedWorkspaceId}
    />
  );
}

interface WorkspacePageInnerProps {
  channelId: string | null;
  selectedWorkspaceId: string | null;
  selectedWorkspace: ReturnType<typeof useWorkspaceStore.getState>['workspaces'][number] | null;
  isOffline: boolean;
  isOwnWorkspace: boolean;
  onSelectWorkspace: (id: string | null) => void;
}

function WorkspacePageInner({
  channelId,
  selectedWorkspaceId,
  selectedWorkspace,
  isOffline,
  isOwnWorkspace,
  onSelectWorkspace,
}: WorkspacePageInnerProps) {
  // Data hooks
  const { refreshWorkspaces } = useWorkspaceSync();
  const { startWorkspace } = useWorkspaceActions();

  const getActiveChannelId = useCallback(() => channelId, [channelId]);
  const { openThreadPanel } = useThreadSync(getActiveChannelId);

  const onNeedsAttention = useCallback((workspaceId: string) => {
    useWorkspaceStore.getState().addAttention(workspaceId);
  }, []);

  useChannelSubscriptions({
    activeChannelId: channelId,
    onNeedsAttention,
    refreshWorkspaces,
  });

  // Load workspaces on mount / channel change
  useEffect(() => {
    if (!channelId) return;
    useWorkspaceStore.getState().clearWorkspaces();
    void refreshWorkspaces(channelId);
  }, [channelId, refreshWorkspaces]);

  const handleBack = useCallback(() => onSelectWorkspace(null), [onSelectWorkspace]);

  // Load thread when workspace selected
  const handleSelectWorkspace = useCallback(
    (workspaceId: string) => {
      onSelectWorkspace(workspaceId);
      const workspace = useWorkspaceStore.getState().workspaces.find((w) => w.id === workspaceId);
      if (workspace) {
        openThreadPanel(workspace);
      }
    },
    [onSelectWorkspace, openThreadPanel],
  );

  if (!channelId) {
    return (
      <div className="flex h-full flex-col">
        <ConnectionStatusBar />
        <div className="flex flex-1 items-center justify-center text-muted">
          No channels available
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ConnectionStatusBar />
      <div className="flex min-h-0 flex-1" data-has-selection={selectedWorkspaceId ? "true" : "false"}>
        {/* Sidebar */}
        <div className="workspace-sidebar relative flex w-64 shrink-0 flex-col border-r border-edge">
          {isOffline && (
            <div className="bg-yellow-500/10 border-b border-yellow-500/30 px-3 py-1.5 text-xs text-yellow-400">
              Instance offline — read-only view
            </div>
          )}
          <WebChannelSelector />
          <WebWorkspaceList
            channelId={channelId}
            selectedWorkspaceId={selectedWorkspaceId}
            onSelectWorkspace={handleSelectWorkspace}
          />
        </div>

        {/* Thread panel */}
        <div className="workspace-thread flex min-w-0 flex-1 flex-col bg-surface-deep">
          {selectedWorkspaceId && selectedWorkspace ? (
            <>
              <WebThreadHeader
                title={selectedWorkspace.ticketTitle || selectedWorkspace.preview?.split('\n')[0] || 'New Workspace'}
                status={selectedWorkspace.status}
                onBack={handleBack}
              />
              <WebThreadPanel
                workspaceId={selectedWorkspaceId}
                channelId={channelId}
              />
              {!isOwnWorkspace ? (
                <div className="border-t border-edge px-3 py-3 text-center text-xs text-muted">
                  Viewing {selectedWorkspace.user?.name ?? 'another user'}'s workspace — read only
                </div>
              ) : selectedWorkspace.status === 'pending' || selectedWorkspace.status === 'handed_off' ? (
                <WebRunButtons
                  initialPrompt={selectedWorkspace.preview ?? ''}
                  workspaceId={selectedWorkspaceId}
                  channelId={channelId}
                  disabled={isOffline}
                  onRun={async ({ prompt, model, effort, planMode }) => {
                    await startWorkspace({
                      workspaceId: selectedWorkspaceId,
                      prompt,
                      channelId: channelId!,
                      model,
                      effort,
                      planMode,
                    });
                  }}
                />
              ) : (
                <WebThreadInput
                  workspaceId={selectedWorkspaceId}
                  channelId={channelId}
                  disabled={isOffline}
                />
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-muted">
              <p className="text-sm">Select a workspace to view its thread</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
