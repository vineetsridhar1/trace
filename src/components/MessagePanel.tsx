import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiChevronRight, FiColumns, FiList, FiSend, FiShare2 } from 'react-icons/fi';
import type { Channel, Workspace, KanbanColumn as KanbanColumnType, KanbanTicket, MiddlePanelView, TicketStatus } from '../types';
import { KanbanBoard } from './KanbanBoard';
import { WorkspaceInput } from './WorkspaceInput';
import { MessageItem, STATUS_CONFIG, STATUS_GROUP_ORDER } from './MessageItem';
import { ChatEmptyState } from './ChatEmptyState';
import { ThreadPanel } from './ThreadPanel';
import { useChannelMessages } from '../hooks/useChannelMessages';
import { useAuth } from '../context/AuthContext';

interface StatusGroup {
  status: TicketStatus;
  workspaces: Workspace[];
}

function CollapsibleStatusGroup({
  status,
  children,
  count,
}: {
  status: TicketStatus;
  children: React.ReactNode;
  count: number;
}) {
  const [open, setOpen] = useState(true);
  const config = STATUS_CONFIG[status];

  return (
    <div>
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-1.5 px-3 py-1.5 hover:bg-[#1f2335]/50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <FiChevronRight
          className={`h-3 w-3 text-[#565f89] transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
        />
        <div className={`h-2 w-2 flex-shrink-0 rounded-full ${config.color} bg-current`} />
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${config.color}`}>
          {config.label}
        </span>
        <span className="rounded-full bg-[#1f2335] px-1.5 py-0.5 text-[10px] font-medium text-[#565f89]">
          {count}
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface MessagePanelProps {
  panelTitle: string;
  channelId: string | null;
  channelCreatedAt: string | null;
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  attentionWorkspaceIds: Set<string>;
  onOpenWorkspace: (workspace: Workspace) => void;
  middlePanelView: MiddlePanelView;
  kanbanColumns: KanbanColumnType[];
  kanbanLoading: boolean;
  onMoveTicket: (ticketId: string, columnId: string, sortOrder: number) => void;
  onDeleteWorkspace?: (workspaceId: string) => void;
  onDeleteWorktree?: (workspaceId: string) => void;
  worktreeWorkspaceIds?: Set<string>;
  deletingWorktreeIds?: Set<string>;
  isFullscreen?: boolean;
  teamProjects?: Channel[];
  onSwitchChannel?: (channelId: string) => void;
  workspacesWithRunningProcesses?: Set<string>;
  activeRunWorkspaceIds?: Set<string>;
}

export function MessagePanel({
  panelTitle,
  channelId,
  channelCreatedAt,
  workspaces,
  selectedWorkspaceId,
  attentionWorkspaceIds,
  onOpenWorkspace,
  middlePanelView,
  kanbanColumns,
  kanbanLoading,
  onDeleteWorkspace,
  onDeleteWorktree,
  worktreeWorkspaceIds,
  deletingWorktreeIds,
  onMoveTicket,
  isFullscreen,
  teamProjects = [],
  onSwitchChannel,
  workspacesWithRunningProcesses,
  activeRunWorkspaceIds,
}: MessagePanelProps) {
  const [projectSubView, setProjectSubView] = useState<'list' | 'board' | 'graph'>('board');
  const feedListRef = useRef<HTMLDivElement | null>(null);

  const ticketByWorkspaceId = useMemo(() => {
    const map = new Map<string, KanbanTicket>();
    for (const col of kanbanColumns) {
      for (const ticket of col.tickets) {
        map.set(ticket.workspaceId, ticket);
      }
    }
    return map;
  }, [kanbanColumns]);

  const groupedWorkspaces = useMemo(() => {
    const buckets = new Map<TicketStatus, Workspace[]>();
    for (const ws of workspaces) {
      let status = (ws.status ?? 'pending') as TicketStatus;
      // "completed" is a visual sub-state of "in_progress" — group them together
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
  }, [workspaces]);

  const nearBottomRef = useRef(true);
  const prevWorkspaceCountRef = useRef(0);

  useEffect(() => {
    const prevCount = prevWorkspaceCountRef.current;
    const currCount = workspaces.length;
    prevWorkspaceCountRef.current = currCount;

    const el = feedListRef.current;
    if (!el) return;

    if (prevCount === 0 || nearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [workspaces]);

  const handleFeedScroll = useCallback(() => {
    const el = feedListRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  const handleBoardClickTicket = useCallback(
    (workspaceId: string) => {
      const workspace = workspaces.find((m) => m.id === workspaceId);
      if (workspace) onOpenWorkspace(workspace);
    },
    [workspaces, onOpenWorkspace],
  );

  const renderGroupedWorkspaces = (showDelete: boolean) =>
    groupedWorkspaces.map((group) => (
      <CollapsibleStatusGroup
        key={group.status}
        status={group.status}
        count={group.workspaces.length}
      >
        {group.workspaces.map((workspace) => (
          <MessageItem
            key={workspace.id}
            workspace={workspace}
            ticket={ticketByWorkspaceId.get(workspace.id) ?? null}
            isSelected={workspace.id === selectedWorkspaceId}
            needsAttention={attentionWorkspaceIds.has(workspace.id)}
            onOpenWorkspace={onOpenWorkspace}
            onDeleteWorkspace={showDelete ? onDeleteWorkspace : undefined}
            onDeleteWorktree={workspace.status === 'merged' ? onDeleteWorktree : undefined}
            hasActiveWorktree={worktreeWorkspaceIds?.has(workspace.id)}
            hasRunningProcess={workspacesWithRunningProcesses?.has(workspace.id)}
            isDeletingWorktree={deletingWorktreeIds?.has(workspace.id)}
            dimmed={workspace.status === 'merged'}
            activelyRunning={activeRunWorkspaceIds?.has(workspace.id)}
          />
        ))}
      </CollapsibleStatusGroup>
    ));

  // Channel messaging
  const { messages: chatMessages, sendMessage: sendChatMessage } = useChannelMessages(
    middlePanelView === 'chat' ? channelId : null,
  );
  const { user: authUser } = useAuth();
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const chatNearBottomRef = useRef(true);
  const [chatInput, setChatInput] = useState('');

  // Animation tracking for new messages
  const renderedIdsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef(true);
  const prevChannelIdRef = useRef<string | null>(null);

  // Reset animation tracking on channel switch
  if (channelId !== prevChannelIdRef.current) {
    prevChannelIdRef.current = channelId;
    renderedIdsRef.current = new Set();
    isInitialLoadRef.current = true;
  }

  // Compute which message IDs are new (should animate)
  const newMessageIds = useMemo(() => {
    if (chatMessages.length === 0) return new Set<string>();

    if (isInitialLoadRef.current) {
      // First non-empty batch — seed all IDs, no animation
      isInitialLoadRef.current = false;
      const allIds = new Set(chatMessages.map((m) => m.id));
      renderedIdsRef.current = allIds;
      return new Set<string>();
    }

    const newIds = new Set<string>();
    for (const msg of chatMessages) {
      if (!renderedIdsRef.current.has(msg.id)) {
        newIds.add(msg.id);
      }
    }
    return newIds;
  }, [chatMessages]);

  // Update renderedIdsRef after render so messages only animate once
  useEffect(() => {
    for (const msg of chatMessages) {
      renderedIdsRef.current.add(msg.id);
    }
  }, [chatMessages]);

  // Auto-scroll chat on new messages
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    if (chatNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chatMessages]);

  const handleChatScroll = useCallback(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    chatNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  const handleSendChat = useCallback(() => {
    if (!chatInput.trim()) return;
    void sendChatMessage(chatInput);
    setChatInput('');
  }, [chatInput, sendChatMessage]);

  const handleChatKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendChat();
    }
  }, [handleSendChat]);

  return (
    <div id="messages-panel" className="flex min-h-0 flex-1 flex-col bg-[#1a1b26]" style={{ minWidth: 200 }}>
      {middlePanelView === 'chat' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Single scroll container for empty state + messages */}
          <div
            ref={chatScrollRef}
            onScroll={handleChatScroll}
            className="min-h-0 flex-1 overflow-y-auto"
          >
          <div className="flex min-h-full flex-col">
            <div className="flex-1" />
            <ChatEmptyState
              channelName={panelTitle.replace(/^#\s*/, '')}
              channelCreatedAt={channelCreatedAt}
            />
            {/* Message list */}
            <div className="px-3 py-2">
              {chatMessages.map((msg) => {
                const isOwn = authUser?.id === msg.author.id;
                const isNew = newMessageIds.has(msg.id);
                return (
                  <div key={msg.id} className={`mb-3 flex items-start gap-2${isNew ? ' message-enter' : ''}`}>
                    {msg.author.avatarUrl ? (
                      <img
                        src={msg.author.avatarUrl}
                        alt={msg.author.name}
                        className="mt-0.5 h-6 w-6 flex-shrink-0 rounded-full"
                      />
                    ) : (
                      <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-violet-500/30 text-[10px] font-bold text-violet-300">
                        {msg.author.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className={`text-xs font-semibold ${isOwn ? 'text-violet-300' : 'text-[#c0caf5]'}`}>
                          {msg.author.name}
                        </span>
                        <span className="text-[10px] text-[#565f89]">{formatMessageTime(msg.createdAt)}</span>
                      </div>
                      <div className="whitespace-pre-wrap text-sm text-[#a9b1d6]">{msg.content}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          </div>
          {/* Input */}
          <div className="border-t border-[#292e42] px-3 py-3">
            <div className="flex items-end gap-2">
              <textarea
                rows={1}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                placeholder="Send a message..."
                style={{ fieldSizing: 'content', minHeight: 38, maxHeight: 300 } as React.CSSProperties}
                className="w-full resize-none rounded-md border border-[#292e42] bg-[#1f2335] px-3 py-2 text-sm text-[#c0caf5] outline-none placeholder:text-[#565f89] focus:border-violet-500/50"
              />
              <button
                type="button"
                onClick={handleSendChat}
                disabled={!chatInput.trim()}
                className="flex h-[38px] w-[38px] flex-shrink-0 cursor-pointer items-center justify-center rounded-md bg-violet-500/20 text-violet-300 transition-colors hover:bg-violet-500/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FiSend className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : middlePanelView === 'board' ? (
        <>
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="flex rounded-lg bg-[#1f2335] p-0.5">
              {([
                { key: 'list', label: 'List', icon: FiList },
                { key: 'board', label: 'Board', icon: FiColumns },
                { key: 'graph', label: 'Graph', icon: FiShare2 },
              ] as const).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setProjectSubView(key)}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    projectSubView === key
                      ? 'bg-violet-500/20 text-violet-300'
                      : 'text-[#565f89] hover:text-[#a9b1d6]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>
          {projectSubView === 'board' ? (
            <KanbanBoard
              columns={kanbanColumns}
              loading={kanbanLoading}
              onClickTicket={handleBoardClickTicket}
              onMoveTicket={onMoveTicket}
            />
          ) : projectSubView === 'list' ? (
            <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-[#565f89]">
              List view coming soon
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-[#565f89]">
              Graph view coming soon
            </div>
          )}
        </>
      ) : middlePanelView === 'projects' ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {teamProjects.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-[#565f89]">
              No projects associated with this team
            </div>
          ) : (
            <div className="flex flex-col py-2">
              {teamProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => onSwitchChannel?.(project.id)}
                  className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[#1f2335]"
                >
                  <span className="text-[#565f89] text-sm">#</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-[#c0caf5]">{project.name}</div>
                  </div>
                  <FiChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-[#565f89]" />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {!(isFullscreen && selectedWorkspaceId) && (
            <div className="flex min-h-0 flex-1 flex-col" style={{ minWidth: 200 }}>
              <div
                id="workspaces-list"
                ref={feedListRef}
                onScroll={handleFeedScroll}
                className="flex min-h-0 flex-1 flex-col overflow-y-auto py-2"
              >
                {renderGroupedWorkspaces(false)}
              </div>
              <WorkspaceInput />
            </div>
          )}
          <ThreadPanel />
        </div>
      )}
    </div>
  );
}
