import React, { useMemo, useState } from 'react';
import { FiChevronRight } from 'react-icons/fi';
import type { Workspace, TicketStatus, KanbanTicket, KanbanColumn as KanbanColumnType } from '../types';
import { MessageItem, STATUS_CONFIG, STATUS_GROUP_ORDER } from './MessageItem';
import { WorkspaceInput } from './WorkspaceInput';
import { useAuth } from '../context/AuthContext';
import { usePresenceStore } from '../stores/presenceStore';

interface StatusGroup {
  status: TicketStatus;
  workspaces: Workspace[];
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
  kanbanColumns: KanbanColumnType[];
  workspacesLoading?: boolean;
  mergedCount?: number;
  mergedWorkspacesLoaded?: boolean;
  mergedWorkspacesLoading?: boolean;
  onExpandMerged?: () => void;
  sidebarWidth: number;
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
  kanbanColumns,
  workspacesLoading,
  mergedCount,
  mergedWorkspacesLoaded,
  mergedWorkspacesLoading,
  onExpandMerged,
  sidebarWidth,
  onStartDrag,
  dragging,
}: WorkspaceSidebarProps) {
  const { user: authUser } = useAuth();
  const presenceByWorkspace = usePresenceStore((s) => s.presenceByWorkspace);

  const ticketByWorkspaceId = useMemo(() => {
    const map = new Map<string, KanbanTicket>();
    for (const col of kanbanColumns) {
      for (const ticket of col.tickets) {
        if (ticket.workspaceId) map.set(ticket.workspaceId, ticket);
      }
    }
    return map;
  }, [kanbanColumns]);

  const groupedWorkspaces = useMemo(() => {
    const buckets = new Map<TicketStatus, Workspace[]>();
    for (const ws of workspaces) {
      if (ws.isProductDoc || ws.isOrchestrator) continue;
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

  return (
    <>
      <div
        className="flex min-h-0 flex-col border-r border-edge bg-surface"
        style={{ width: `${sidebarWidth}px`, minWidth: sidebarWidth > 0 ? 200 : 0 }}
      >
        {/* Header */}
        <div className="flex h-[40px] shrink-0 items-center border-b border-edge px-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Workspaces
          </h2>
        </div>

        {/* Workspace list */}
        <div
          className="flex min-h-0 flex-1 flex-col overflow-y-auto py-2"
        >
          {workspacesLoading && workspaces.length === 0 ? (
            <WorkspaceListSkeleton />
          ) : groupedWorkspaces.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-xs text-muted">
              No workspaces yet
            </div>
          ) : (
            groupedWorkspaces.map((group) => (
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
                    ticket={ticketByWorkspaceId.get(workspace.id) ?? null}
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
            ))
          )}
        </div>

        {/* Create workspace input */}
        <WorkspaceInput />
      </div>
      <div
        className={`resize-handle ${dragging ? 'active' : ''}`}
        onMouseDown={(e) => {
          e.preventDefault();
          onStartDrag();
        }}
      />
    </>
  );
}
