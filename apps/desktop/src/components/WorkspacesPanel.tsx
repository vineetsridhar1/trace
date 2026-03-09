import { useEffect, useMemo, useState } from 'react';
import {
  FiBriefcase,
  FiFolder,
  FiMaximize2,
  FiMinimize2,
  FiSearch,
  FiX,
} from 'react-icons/fi';
import type {
  Workspace,
  KanbanColumn as KanbanColumnType,
  KanbanTicket,
  TicketStatus,
} from '../types';
import { STATUS_CONFIG, STATUS_GROUP_ORDER } from './MessageItem';
import { useAuth } from '../context/AuthContext';

type WorkspaceFilter = 'active' | 'merged' | 'all';

const DISPLAY_STATUS_ORDER: TicketStatus[] = [
  ...STATUS_GROUP_ORDER.filter((status) => status !== 'merged'),
  'completed',
  'merged',
];

function normalizeStatus(status: TicketStatus): TicketStatus {
  return status;
}

function StatusSection({
  status,
  count,
  children,
}: {
  status: TicketStatus;
  count: number;
  children: React.ReactNode;
}) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;

  return (
    <div>
      <div className="flex items-center gap-2 px-1 pb-2">
        <div className={`h-2 w-2 rounded-full ${config.color} bg-current`} />
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${config.color}`}>
          {config.label}
        </span>
        <span className="rounded-full bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium text-muted">
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

function WorkspaceListSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-4 py-4">
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 rounded-xl border border-edge bg-surface-elevated/20 px-4 py-3"
        >
          <div className="h-9 w-9 flex-shrink-0 rounded-lg bg-[#292e42] animate-pulse" />
          <div className="min-w-0 flex-1">
            <div className="h-3.5 w-32 rounded bg-[#292e42] animate-pulse" />
            <div className="mt-2 h-3 w-48 rounded bg-[#292e42] animate-pulse" />
          </div>
          <div className="h-3 w-20 rounded bg-[#292e42] animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function formatRelativeTime(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return '';

  const diffMs = timestamp - Date.now();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  if (Math.abs(diffMs) < hour) {
    return formatter.format(Math.round(diffMs / minute), 'minute');
  }
  if (Math.abs(diffMs) < day) {
    return formatter.format(Math.round(diffMs / hour), 'hour');
  }
  if (Math.abs(diffMs) < week) {
    return formatter.format(Math.round(diffMs / day), 'day');
  }
  if (Math.abs(diffMs) < month) {
    return formatter.format(Math.round(diffMs / week), 'week');
  }
  if (Math.abs(diffMs) < year) {
    return formatter.format(Math.round(diffMs / month), 'month');
  }
  return formatter.format(Math.round(diffMs / year), 'year');
}

function workspaceTitle(workspace: Workspace, ticket: KanbanTicket | null): string {
  return ticket?.title || workspace.ticketTitle || workspace.preview || 'New Workspace';
}

interface WorkspacesPanelProps {
  channelName: string;
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  onOpenWorkspace: (workspace: Workspace) => void;
  kanbanColumns: KanbanColumnType[];
  activeRunWorkspaceIds?: Set<string>;
  workspacesLoading?: boolean;
  mergedCount?: number;
  mergedWorkspacesLoaded?: boolean;
  mergedWorkspacesLoading?: boolean;
  onExpandMerged?: () => void;
  isFullscreen?: boolean;
  onExpandToFullscreen?: () => void;
  onDockToSidebar?: () => void;
}

export function WorkspacesPanel({
  channelName,
  workspaces,
  selectedWorkspaceId,
  onOpenWorkspace,
  kanbanColumns,
  activeRunWorkspaceIds,
  workspacesLoading,
  mergedCount = 0,
  mergedWorkspacesLoaded = false,
  mergedWorkspacesLoading = false,
  onExpandMerged,
  isFullscreen = false,
  onExpandToFullscreen,
  onDockToSidebar,
}: WorkspacesPanelProps) {
  const { user: authUser } = useAuth();
  const [filter, setFilter] = useState<WorkspaceFilter>('all');
  const [search, setSearch] = useState('');

  const ticketByWorkspaceId = useMemo(() => {
    const map = new Map<string, KanbanTicket>();
    for (const column of kanbanColumns) {
      for (const ticket of column.tickets) {
        if (ticket.workspaceId) map.set(ticket.workspaceId, ticket);
      }
    }
    return map;
  }, [kanbanColumns]);

  const regularWorkspaces = useMemo(() => {
    const items = workspaces.filter((workspace) => !workspace.isProductDoc && !workspace.isOrchestrator);
    return [...items].sort((a, b) => {
      if (authUser?.id) {
        const aOwn = a.userId === authUser.id ? 0 : 1;
        const bOwn = b.userId === authUser.id ? 0 : 1;
        if (aOwn !== bOwn) return aOwn - bOwn;
      }
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });
  }, [authUser?.id, workspaces]);

  const statusCounts = useMemo(
    () =>
      regularWorkspaces.reduce<Record<TicketStatus, number>>((counts, workspace) => {
        const status = normalizeStatus(workspace.status);
        counts[status] = (counts[status] ?? 0) + 1;
        return counts;
      }, {
        pending: 0,
        creation: 0,
        in_progress: 0,
        completed: 0,
        merged: 0,
        needs_input: 0,
        queued: 0,
        review: 0,
        handed_off: 0,
      }),
    [regularWorkspaces],
  );

  const mergedWorkspaceCount = mergedWorkspacesLoaded ? statusCounts.merged : mergedCount;
  const activeCount = regularWorkspaces.filter((workspace) => workspace.status !== 'merged').length;
  const allCount = activeCount + mergedWorkspaceCount;

  useEffect(() => {
    if (filter === 'active') return;
    if (mergedWorkspacesLoaded || mergedWorkspacesLoading || mergedCount === 0) return;
    onExpandMerged?.();
  }, [filter, mergedCount, mergedWorkspacesLoaded, mergedWorkspacesLoading, onExpandMerged]);

  const searchNeedle = search.trim().toLowerCase();

  const filteredWorkspaces = useMemo(
    () =>
      regularWorkspaces.filter((workspace) => {
        if (filter === 'active' && normalizeStatus(workspace.status) === 'merged') return false;
        if (filter === 'merged' && normalizeStatus(workspace.status) !== 'merged') return false;
        if (!searchNeedle) return true;

        const ticket = ticketByWorkspaceId.get(workspace.id) ?? null;
        const haystack = [
          workspaceTitle(workspace, ticket),
          workspace.preview,
          workspace.branch,
          workspace.user?.name,
          STATUS_CONFIG[workspace.status]?.label,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(searchNeedle);
      }),
    [filter, regularWorkspaces, searchNeedle, ticketByWorkspaceId],
  );

  const filters = useMemo(() => {
    return [
      { key: 'all' as const, label: 'All', count: allCount },
      { key: 'active' as const, label: 'Active', count: activeCount },
      { key: 'merged' as const, label: 'Merged', count: mergedWorkspaceCount },
    ];
  }, [activeCount, allCount, mergedWorkspaceCount]);

  const groupedWorkspaces = useMemo(() => {
    const buckets = new Map<TicketStatus, Workspace[]>();
    for (const workspace of filteredWorkspaces) {
      const status = normalizeStatus(workspace.status);
      const bucket = buckets.get(status);
      if (bucket) {
        bucket.push(workspace);
      } else {
        buckets.set(status, [workspace]);
      }
    }

    return DISPLAY_STATUS_ORDER
      .map((status) => ({ status, workspaces: buckets.get(status) ?? [] }))
      .filter((group) => group.workspaces.length > 0);
  }, [filteredWorkspaces]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <div className="border-b border-edge px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="scrollbar-hide -mx-1 min-w-0 flex-1 overflow-x-auto">
            <div className="flex min-w-max items-center gap-1 rounded-xl bg-surface-elevated p-1">
              {filters.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === item.key
                    ? 'bg-surface text-primary shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]'
                    : 'text-muted hover:text-primary'
                }`}
              >
                {item.label} {item.count}
              </button>
            ))}
            </div>
          </div>
          <div className="relative w-[320px] max-w-[42%] min-w-[220px] flex-shrink-0">
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search..."
              className="w-full rounded-xl border border-edge bg-surface-elevated py-2 pl-9 pr-9 text-sm text-primary placeholder:text-muted focus:border-accent focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 rounded p-1 text-muted transition-colors hover:bg-surface hover:text-primary"
                aria-label="Clear search"
              >
                <FiX className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {(onDockToSidebar || onExpandToFullscreen) && (
            <div className="flex items-center gap-2">
              {onDockToSidebar && (
                <button
                  type="button"
                  onClick={onDockToSidebar}
                  className="inline-flex items-center gap-2 rounded-xl border border-edge bg-surface-elevated px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-surface"
                >
                  <FiMinimize2 className="h-3.5 w-3.5" />
                  <span>Sidebar</span>
                </button>
              )}
              {!isFullscreen && onExpandToFullscreen && (
                <button
                  type="button"
                  onClick={onExpandToFullscreen}
                  className="inline-flex items-center gap-2 rounded-xl border border-edge bg-surface-elevated px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-surface"
                >
                  <FiMaximize2 className="h-3.5 w-3.5" />
                  <span>Expand</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 py-4">
          <div className="mb-3 flex items-center gap-2 text-sm text-muted">
            <FiBriefcase className="h-4 w-4" />
            <span className="font-medium text-primary">{channelName}</span>
            <span>{allCount}</span>
          </div>

          {workspacesLoading && regularWorkspaces.length === 0 ? (
            <WorkspaceListSkeleton />
          ) : mergedWorkspacesLoading && filter === 'merged' && filteredWorkspaces.length === 0 ? (
            <WorkspaceListSkeleton />
          ) : filteredWorkspaces.length === 0 ? (
            <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-edge bg-surface-elevated/10 text-sm text-muted">
              {searchNeedle ? 'No workspaces match this search' : 'No workspaces yet'}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {groupedWorkspaces.map((group) => (
                <StatusSection
                  key={group.status}
                  status={group.status}
                  count={group.workspaces.length}
                >
                  <div className="overflow-hidden rounded-2xl border border-edge bg-surface-elevated/10">
                    {group.workspaces.map((workspace, index) => {
                      const ticket = ticketByWorkspaceId.get(workspace.id) ?? null;
                      const status = STATUS_CONFIG[workspace.status] ?? STATUS_CONFIG.pending;
                      const title = workspaceTitle(workspace, ticket);
                      const branch = workspace.branch?.replace(/^trace\//, '') || workspace.user?.name || status.label;
                      const isSelected = workspace.id === selectedWorkspaceId;
                      const isRunning = activeRunWorkspaceIds?.has(workspace.id) ?? false;

                      return (
                        <button
                          key={workspace.id}
                          type="button"
                          onClick={() => onOpenWorkspace(workspace)}
                          className={`flex w-full items-center gap-4 px-4 py-3 text-left transition-colors ${
                            index > 0 ? 'border-t border-edge' : ''
                          } ${
                            isSelected
                              ? 'bg-accent/12'
                              : 'hover:bg-surface-elevated/40'
                          }`}
                        >
                          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-surface text-muted">
                            <FiFolder className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium text-primary">{title}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${status.bgColor} ${status.color}`}>
                                {isRunning ? 'Running' : status.label}
                              </span>
                            </div>
                            <div className="mt-1 truncate text-xs text-muted">{branch}</div>
                          </div>
                          <div className="shrink-0 text-xs text-muted">
                            Opened {formatRelativeTime(workspace.createdAt)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </StatusSection>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
