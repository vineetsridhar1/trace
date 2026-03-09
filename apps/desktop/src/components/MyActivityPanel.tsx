import { useMemo, useState } from 'react';
import { FiChevronLeft, FiChevronRight, FiLoader, FiSearch, FiX } from 'react-icons/fi';
import type { Workspace, TicketStatus } from '../types';
import { STATUS_CONFIG, STATUS_GROUP_ORDER } from './MessageItem';
import { useMyActivityStore } from '../stores/myActivityStore';
import { ScrambleText } from './ScrambleText';
import { avatarInitial } from '../utils';
import { Tooltip } from './Tooltip';

type FilterMode = 'all' | 'active' | 'merged';

const ACTIVE_STATUSES = new Set<TicketStatus>([
  'pending',
  'creation',
  'in_progress',
  'needs_input',
  'queued',
  'review',
  'handed_off',
]);

interface ChannelGroup {
  channelId: string;
  channelName: string;
  workspaces: Workspace[];
}

interface StatusGroup {
  status: TicketStatus;
  workspaces: Workspace[];
}

function groupByChannel(workspaces: Workspace[]): ChannelGroup[] {
  const map = new Map<string, ChannelGroup>();
  for (const ws of workspaces) {
    let group = map.get(ws.channelId);
    if (!group) {
      group = {
        channelId: ws.channelId,
        channelName: ws.channelName ?? ws.channelId,
        workspaces: [],
      };
      map.set(ws.channelId, group);
    }
    group.workspaces.push(ws);
  }
  return Array.from(map.values());
}

function groupByStatus(workspaces: Workspace[]): StatusGroup[] {
  const buckets = new Map<TicketStatus, Workspace[]>();
  for (const ws of workspaces) {
    let status = (ws.status ?? 'pending') as TicketStatus;
    if (status === 'completed') status = 'in_progress';
    let bucket = buckets.get(status);
    if (!bucket) {
      bucket = [];
      buckets.set(status, bucket);
    }
    bucket.push(ws);
  }
  const groups: StatusGroup[] = [];
  for (const status of STATUS_GROUP_ORDER) {
    const items = buckets.get(status);
    if (items && items.length > 0) {
      groups.push({ status, workspaces: items });
    }
  }
  return groups;
}

function ChannelAccordion({
  channelName,
  count,
  isActive,
  children,
}: {
  channelName: string;
  count: number;
  isActive?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const initial = channelName.trim().charAt(0).toUpperCase() || '#';

  return (
    <div className="overflow-hidden">
      <button
        type="button"
        className={`flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-surface-elevated/40 ${isActive ? 'bg-surface-elevated/30' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${isActive ? 'bg-accent/20 text-accent-light' : 'bg-surface-elevated text-primary'}`}>
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-primary">{channelName}</span>
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

function StatusGroupHeader({
  status,
  count,
  open,
  onToggle,
  loading,
}: {
  status: TicketStatus;
  count: number;
  open: boolean;
  onToggle: () => void;
  loading?: boolean;
}) {
  const config = STATUS_CONFIG[status];

  return (
    <button
      type="button"
      className="flex w-full cursor-pointer items-center gap-1.5 px-3 py-1.5 hover:bg-surface-elevated/50 transition-colors"
      onClick={onToggle}
    >
      <FiChevronRight
        className={`h-3 w-3 text-muted transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
      />
      <div className={`h-2 w-2 flex-shrink-0 rounded-full ${config.color} bg-current`} />
      <span className={`text-[11px] font-semibold uppercase tracking-wide ${config.color}`}>
        {config.label}
      </span>
      <span className="rounded-full bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium text-muted">
        {count}
      </span>
      {loading && <FiLoader className="h-3 w-3 animate-spin text-muted" />}
    </button>
  );
}

function WorkspaceRow({
  workspace,
  onOpen,
  isSelected,
}: {
  workspace: Workspace;
  onOpen: (channelId: string, workspaceId: string) => void;
  isSelected?: boolean;
}) {
  const status = (workspace.status ?? 'pending') as TicketStatus;
  const avatarConfig = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const title = workspace.ticketTitle || workspace.preview || 'New Workspace';
  const branch = workspace.branch?.replace(/^trace\//, '');
  const relTime = getRelativeTime(workspace.createdAt);

  return (
    <button
      type="button"
      className={`message-item group flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left outline-none transition-colors ${isSelected ? 'bg-accent/10' : ''}`}
      onClick={() => onOpen(workspace.channelId, workspace.id)}
      title={title}
    >
      {workspace.user?.avatarUrl ? (
        <img
          src={workspace.user.avatarUrl}
          alt={workspace.user.name}
          className={`h-6 w-6 flex-shrink-0 rounded-full ring-2 ${avatarConfig.avatarBg}`}
        />
      ) : (
        <div
          className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${avatarConfig.avatarBg} ${avatarConfig.avatarText}`}
        >
          {workspace.user
            ? workspace.user.name.charAt(0).toUpperCase()
            : avatarInitial(workspace.cliSessionId)}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-primary">
          <ScrambleText text={title} />
        </div>
        {branch && (
          <div className="truncate font-mono text-[10px] text-muted">{branch}</div>
        )}
      </div>

      <span className="shrink-0 text-[10px] text-muted">{relTime}</span>
    </button>
  );
}

function getRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function StatusGroupSection({
  status,
  workspaces,
  onOpen,
  mergedCount,
  onExpandMerged,
  mergedLoading,
  selectedWorkspaceId,
}: {
  status: TicketStatus;
  workspaces: Workspace[];
  onOpen: (channelId: string, workspaceId: string) => void;
  mergedCount?: number;
  onExpandMerged?: () => void;
  mergedLoading?: boolean;
  selectedWorkspaceId?: string | null;
}) {
  const [open, setOpen] = useState(status !== 'merged');

  return (
    <div>
      <StatusGroupHeader
        status={status}
        count={mergedCount ?? workspaces.length}
        open={open}
        onToggle={() => {
          const willOpen = !open;
          setOpen(willOpen);
          if (willOpen && onExpandMerged) onExpandMerged();
        }}
        loading={mergedLoading}
      />
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          {mergedLoading && workspaces.length === 0 ? (
            <div className="flex flex-col gap-1 px-1 py-2">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2.5">
                  <div className="h-6 w-6 flex-shrink-0 rounded-full bg-[#292e42] animate-pulse" />
                  <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                    <div className="h-3.5 w-3/5 rounded bg-[#292e42] animate-pulse" />
                    <div className="h-3 w-4/5 rounded bg-[#292e42] animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            workspaces.map((ws) => (
              <WorkspaceRow key={ws.id} workspace={ws} onOpen={onOpen} isSelected={ws.id === selectedWorkspaceId} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar body (filter + list) ────────────────────────────────────

function MyActivityBody({
  onOpenWorkspace,
  onExpandMerged,
  activeChannelId,
  selectedWorkspaceId,
  joinedChannelIds,
}: {
  onOpenWorkspace: (channelId: string, workspaceId: string) => void;
  onExpandMerged: () => void;
  activeChannelId: string | null;
  selectedWorkspaceId: string | null;
  joinedChannelIds: Set<string>;
}) {
  const workspaces = useMyActivityStore((s) => s.workspaces);
  const loading = useMyActivityStore((s) => s.loading);
  const mergedCount = useMyActivityStore((s) => s.mergedCount);
  const mergedWorkspacesLoaded = useMyActivityStore((s) => s.mergedWorkspacesLoaded);
  const mergedWorkspacesLoading = useMyActivityStore((s) => s.mergedWorkspacesLoading);

  const [filter, setFilter] = useState<FilterMode>('all');
  const [search, setSearch] = useState('');

  const filteredWorkspaces = useMemo(() => {
    let result = workspaces.filter(
      (ws) => !ws.isProductDoc && joinedChannelIds.has(ws.channelId),
    );

    if (filter === 'active') {
      result = result.filter((ws) => ACTIVE_STATUSES.has(ws.status as TicketStatus));
    } else if (filter === 'merged') {
      result = result.filter((ws) => ws.status === 'merged');
    }

    if (search.trim()) {
      const lower = search.trim().toLowerCase();
      result = result.filter(
        (ws) =>
          (ws.ticketTitle ?? '').toLowerCase().includes(lower) ||
          (ws.preview ?? '').toLowerCase().includes(lower) ||
          (ws.branch ?? '').toLowerCase().includes(lower),
      );
    }

    return result;
  }, [workspaces, filter, search, joinedChannelIds]);

  const channelGroups = useMemo(() => groupByChannel(filteredWorkspaces), [filteredWorkspaces]);

  if (loading && workspaces.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted">
        <FiLoader className="mr-2 h-4 w-4 animate-spin" />
        Loading...
      </div>
    );
  }

  return (
    <>
      {/* Filters + search */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-edge px-3 py-2">
        <div className="flex items-center gap-1 rounded-lg bg-surface-deep p-0.5">
          {(['all', 'active', 'merged'] as FilterMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setFilter(mode);
                if (mode === 'merged' && !mergedWorkspacesLoaded) {
                  onExpandMerged();
                }
              }}
              className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                filter === mode
                  ? 'bg-surface-elevated text-primary shadow-sm'
                  : 'text-muted hover:text-primary'
              }`}
            >
              {mode === 'all' ? 'All' : mode === 'active' ? 'Active' : `Merged${mergedCount > 0 ? ` (${mergedCount})` : ''}`}
            </button>
          ))}
        </div>
        <div className="relative">
          <FiSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workspaces..."
            className="w-full rounded border border-edge bg-surface-deep py-1.5 pl-7 pr-2 text-xs text-primary placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      {/* Workspace list */}
      <div className="flex-1 overflow-y-auto py-1">
        {channelGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted">
            <span className="text-xs">
              {search.trim() ? 'No matching workspaces' : 'No workspaces yet'}
            </span>
            {!search.trim() && (
              <span className="text-[11px]">Workspaces you create will appear here.</span>
            )}
          </div>
        ) : (
          channelGroups.map((channelGroup) => {
            const statusGroups = groupByStatus(channelGroup.workspaces);
            const totalCount =
              statusGroups.reduce((sum, g) => sum + g.workspaces.length, 0);

            return (
              <ChannelAccordion
                key={channelGroup.channelId}
                channelName={channelGroup.channelName}
                count={totalCount}
                isActive={channelGroup.channelId === activeChannelId}
              >
                {statusGroups.map((sg) => (
                  <StatusGroupSection
                    key={sg.status}
                    status={sg.status}
                    workspaces={sg.workspaces}
                    onOpen={onOpenWorkspace}
                    onExpandMerged={sg.status === 'merged' ? onExpandMerged : undefined}
                    mergedLoading={sg.status === 'merged' ? mergedWorkspacesLoading : false}
                    selectedWorkspaceId={selectedWorkspaceId}
                  />
                ))}
              </ChannelAccordion>
            );
          })
        )}
      </div>
    </>
  );
}

// ─── Sidebar wrapper (matches WorkspaceSidebar shell) ─────────────────

export interface MyActivitySidebarProps {
  onOpenWorkspace: (channelId: string, workspaceId: string) => void;
  onExpandMerged: () => void;
  activeChannelId: string | null;
  selectedWorkspaceId: string | null;
  joinedChannelIds: Set<string>;
  dockSide?: 'left' | 'right';
  onToggleDockSide?: () => void;
  sidebarWidth: number;
  isOpen: boolean;
  onToggleOpen: () => void;
  onStartDrag: () => void;
  dragging: boolean;
}

export function MyActivitySidebar({
  onOpenWorkspace,
  onExpandMerged,
  activeChannelId,
  selectedWorkspaceId,
  joinedChannelIds,
  dockSide = 'right',
  onToggleDockSide,
  sidebarWidth,
  isOpen,
  onToggleOpen,
  onStartDrag,
  dragging,
}: MyActivitySidebarProps) {
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
          My Activity
        </h2>
        <div className="flex items-center gap-1">
          {onToggleDockSide && (
            <Tooltip text={dockSide === 'left' ? 'Dock right' : 'Dock left'}>
              <button
                type="button"
                onClick={onToggleDockSide}
                className="rounded p-1 text-muted transition-colors hover:bg-surface-elevated hover:text-primary"
                aria-label={dockSide === 'left' ? 'Dock sidebar to the right' : 'Dock sidebar to the left'}
              >
                {dockSide === 'left' ? (
                  <FiChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <FiChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
            </Tooltip>
          )}
          <button
            type="button"
            onClick={onToggleOpen}
            className="rounded p-1 text-muted transition-colors hover:bg-surface-elevated hover:text-primary"
            aria-label="Close my activity sidebar"
          >
            <FiX className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Body */}
      <MyActivityBody
        onOpenWorkspace={onOpenWorkspace}
        onExpandMerged={onExpandMerged}
        activeChannelId={activeChannelId}
        selectedWorkspaceId={selectedWorkspaceId}
        joinedChannelIds={joinedChannelIds}
      />
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
