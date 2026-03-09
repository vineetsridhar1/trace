import React, { useMemo, useState } from 'react';
import { FiChevronLeft, FiChevronRight, FiMaximize2, FiX } from 'react-icons/fi';
import type { Workspace, TicketStatus } from '../types';
import { MessageItem, STATUS_CONFIG, STATUS_GROUP_ORDER } from './MessageItem';
import { WorkspaceInput } from './WorkspaceInput';
import { useAuth } from '../context/AuthContext';
import { useChannelContext } from '../context/ChannelContext';
import { usePresenceStore } from '../stores/presenceStore';
import { Tooltip } from './Tooltip';

interface StatusGroup {
  status: TicketStatus;
  workspaces: Workspace[];
}

function ProjectAccordion({
  name,
  count,
  children,
}: {
  name: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const initial = name.trim().charAt(0).toUpperCase() || 'P';

  return (
    <div className="overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-surface-elevated/40"
        onClick={() => setOpen((value) => !value)}
      >
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-sm font-semibold text-primary">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-primary">{name}</span>
            <span className="text-sm text-muted">({count})</span>
          </div>
        </div>
        <FiChevronRight
          className={`h-4 w-4 flex-shrink-0 text-muted transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
        />
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden border-t border-edge/60 pt-1">
          {children}
        </div>
      </div>
    </div>
  );
}

function CollapsibleStatusGroup({
  status,
  children,
  count,
  displayCount,
  onExpand,
  loading,
}: {
  status: TicketStatus;
  children: React.ReactNode;
  count: number;
  displayCount?: number;
  onExpand?: () => void;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(status !== 'merged');
  const config = STATUS_CONFIG[status];

  return (
    <div>
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-1.5 px-3 py-1.5 hover:bg-surface-elevated/50 transition-colors"
        onClick={() => {
          const willOpen = !open;
          setOpen(willOpen);
          if (willOpen && onExpand) onExpand();
        }}
      >
        <FiChevronRight
          className={`h-3 w-3 text-muted transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
        />
        <div
          className={`h-2 w-2 flex-shrink-0 rounded-full ${config.color} bg-current`}
        />
        <span
          className={`text-[11px] font-semibold uppercase tracking-wide ${config.color}`}
        >
          {config.label}
        </span>
        <span className="rounded-full bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium text-muted">
          {displayCount ?? count}
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          {loading ? (
            <div className="flex flex-col gap-1 px-1 py-2">
              {Array.from({ length: Math.min(displayCount ?? 3, 3) }, (_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2.5">
                  <div className="h-8 w-8 flex-shrink-0 rounded-full bg-[#292e42] animate-pulse" />
                  <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                    <div className="h-3.5 w-3/5 rounded bg-[#292e42] animate-pulse" />
                    <div className="h-3 w-4/5 rounded bg-[#292e42] animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}

function WorkspaceListSkeleton() {
  return (
    <div className="flex flex-col gap-1 px-1 py-2">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2.5">
          <div className="h-8 w-8 flex-shrink-0 rounded-full bg-[#292e42] animate-pulse" />
          <div className="min-w-0 flex-1 flex flex-col gap-1.5">
            <div className="h-3.5 w-3/5 rounded bg-[#292e42] animate-pulse" />
            <div className="h-3 w-4/5 rounded bg-[#292e42] animate-pulse" />
          </div>
          <div className="h-4 w-4 flex-shrink-0 rounded bg-[#292e42] animate-pulse" />
        </div>
      ))}
    </div>
  );
}

interface WorkspaceSidebarProps {
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  attentionWorkspaceIds: Set<string>;
  channelId: string | null;
  onOpenWorkspace: (workspace: Workspace) => void;
  onDeleteWorkspace?: (workspaceId: string) => void;
  onMarkMerged?: (workspaceId: string) => void;
  workspacesWithRunningProcesses?: Set<string>;
  activeRunWorkspaceIds?: Set<string>;
  workspacesLoading?: boolean;
  mergedCount?: number;
  mergedWorkspacesLoaded?: boolean;
  mergedWorkspacesLoading?: boolean;
  onExpandMerged?: () => void;
  onExpandToFullscreen?: () => void;
  dockSide?: 'left' | 'right';
  onToggleDockSide?: () => void;
  sidebarWidth: number;
  isOpen: boolean;
  onToggleOpen: () => void;
  onStartDrag: () => void;
  dragging: boolean;
}

export function WorkspaceSidebar({
  workspaces,
  selectedWorkspaceId,
  attentionWorkspaceIds,
  channelId,
  onOpenWorkspace,
  onDeleteWorkspace,
  onMarkMerged,
  workspacesWithRunningProcesses,
  activeRunWorkspaceIds,
  workspacesLoading,
  mergedCount,
  mergedWorkspacesLoaded,
  mergedWorkspacesLoading,
  onExpandMerged,
  onExpandToFullscreen,
  dockSide = 'right',
  onToggleDockSide,
  sidebarWidth,
  isOpen,
  onToggleOpen,
  onStartDrag,
  dragging,
}: WorkspaceSidebarProps) {
  const { user: authUser } = useAuth();
  const { enrichedActiveChannel } = useChannelContext();
  const presenceByWorkspace = usePresenceStore((s) => s.presenceByWorkspace);


  const groupedWorkspaces = useMemo(() => {
    const buckets = new Map<TicketStatus, Workspace[]>();
    for (const ws of workspaces) {
      if (ws.isProductDoc) continue;
      let status = (ws.status ?? 'pending') as TicketStatus;
      if (status === 'completed') status = 'in_progress';
      let bucket = buckets.get(status);
      if (!bucket) {
        bucket = [];
        buckets.set(status, bucket);
      }
      bucket.push(ws);
    }

    const currentUserId = authUser?.id;
    const groups: StatusGroup[] = [];
    for (const status of STATUS_GROUP_ORDER) {
      const items = buckets.get(status);
      if (items && items.length > 0) {
        if (currentUserId) {
          items.sort((a, b) => {
            const aOwn = a.userId === currentUserId ? 0 : 1;
            const bOwn = b.userId === currentUserId ? 0 : 1;
            return aOwn - bOwn;
          });
        }
        groups.push({ status, workspaces: items });
      } else if (status === 'merged' && mergedCount && mergedCount > 0) {
        groups.push({ status, workspaces: [] });
      }
    }
    return groups;
  }, [workspaces, authUser?.id, mergedCount]);

  const projectName = enrichedActiveChannel?.name?.trim() || 'Project';

  const projectWorkspaceCount = useMemo(
    () =>
      groupedWorkspaces.reduce((total, group) => {
        if (group.status === 'merged' && !mergedWorkspacesLoaded) {
          return total + (mergedCount ?? group.workspaces.length);
        }
        return total + group.workspaces.length;
      }, 0),
    [groupedWorkspaces, mergedCount, mergedWorkspacesLoaded],
  );

  const workspaceShortcutMap = useMemo(() => {
    const map = new Map<string, number>();
    let idx = 1;
    for (const group of groupedWorkspaces) {
      for (const ws of group.workspaces) {
        map.set(ws.id, idx);
        idx++;
      }
    }
    return map;
  }, [groupedWorkspaces]);

  const sidebarBody = (
    <div
      id="workspace-sidebar"
      className={`flex min-h-0 flex-col bg-surface ${
        dockSide === 'left' ? 'border-r border-edge' : 'border-l border-edge'
      } ${isOpen ? 'mobile-workspace-drawer-open' : ''}`}
      style={{ width: `${sidebarWidth}px`, minWidth: sidebarWidth > 0 ? 180 : 0 }}
    >
      {/* Header */}
      <div className="flex h-[40px] shrink-0 items-center justify-between border-b border-edge px-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Workspaces
        </h2>
        <div className="flex items-center gap-1">
          {onToggleDockSide && (
            <Tooltip text={dockSide === 'left' ? 'Dock right' : 'Dock left'}>
              <button
                type="button"
                onClick={onToggleDockSide}
                className="rounded p-1 text-muted transition-colors hover:bg-surface-elevated hover:text-primary"
                aria-label={dockSide === 'left' ? 'Dock workspace sidebar to the right' : 'Dock workspace sidebar to the left'}
              >
                {dockSide === 'left' ? (
                  <FiChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <FiChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
            </Tooltip>
          )}
          {onExpandToFullscreen && (
            <Tooltip text="Expand workspaces">
              <button
                type="button"
                onClick={onExpandToFullscreen}
                className="rounded p-1 text-muted transition-colors hover:bg-surface-elevated hover:text-primary"
                aria-label="Expand workspaces"
              >
                <FiMaximize2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </Tooltip>
          )}
          <button
            type="button"
            onClick={onToggleOpen}
            className="rounded p-1 text-muted transition-colors hover:bg-surface-elevated hover:text-primary"
            aria-label="Hide workspace sidebar"
          >
            <FiX className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Workspace list */}
      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto py-2"
      >
        {workspacesLoading && workspaces.length === 0 ? (
          <ProjectAccordion name={projectName} count={projectWorkspaceCount}>
            <WorkspaceListSkeleton />
          </ProjectAccordion>
        ) : groupedWorkspaces.length === 0 ? (
          <ProjectAccordion name={projectName} count={projectWorkspaceCount}>
            <div className="flex items-center justify-center px-3 py-6 text-xs text-muted">
              No workspaces yet
            </div>
          </ProjectAccordion>
        ) : (
          <ProjectAccordion name={projectName} count={projectWorkspaceCount}>
            {groupedWorkspaces.map((group) => (
              <CollapsibleStatusGroup
                key={group.status}
                status={group.status}
                count={group.workspaces.length}
                displayCount={
                  group.status === 'merged' && !mergedWorkspacesLoaded
                    ? mergedCount
                    : undefined
                }
                onExpand={
                  group.status === 'merged' && !mergedWorkspacesLoaded
                    ? onExpandMerged
                    : undefined
                }
                loading={group.status === 'merged' && mergedWorkspacesLoading}
              >
                {group.workspaces.map((workspace) => (
                  <MessageItem
                    key={workspace.id}
                    workspace={workspace}
                    ticket={null}
                    isSelected={workspace.id === selectedWorkspaceId}
                    needsAttention={attentionWorkspaceIds.has(workspace.id)}
                    onOpenWorkspace={onOpenWorkspace}
                    onDeleteWorkspace={onDeleteWorkspace}
                    onMarkMerged={onMarkMerged}
                    channelId={channelId}
                    hasRunningProcess={workspacesWithRunningProcesses?.has(workspace.id)}
                    dimmed={workspace.status === 'merged'}
                    activelyRunning={activeRunWorkspaceIds?.has(workspace.id)}
                    shortcutIndex={workspaceShortcutMap.get(workspace.id)}
                    viewers={presenceByWorkspace.get(workspace.id)}
                  />
                ))}
              </CollapsibleStatusGroup>
            ))}
          </ProjectAccordion>
        )}
      </div>

      {/* Create workspace input */}
      <WorkspaceInput />
    </div>
  );

  return (
    <>
      {dockSide === 'right' && (
        <div
          className={`resize-handle ${dragging ? 'active' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onStartDrag();
          }}
        />
      )}
      {sidebarBody}
      {dockSide === 'left' && (
        <div
          className={`resize-handle ${dragging ? 'active' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onStartDrag();
          }}
        />
      )}
    </>
  );
}
