import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiChevronRight, FiColumns, FiList, FiShare2 } from 'react-icons/fi';
import type { Channel, ChannelMessage, KanbanColumn as KanbanColumnType, KanbanTicket, MiddlePanelView, TicketStatus } from '../types';
import { KanbanBoard } from './KanbanBoard';
import { MessageInput } from './MessageInput';
import { MessageItem, STATUS_CONFIG, STATUS_GROUP_ORDER } from './MessageItem';
import { ChatEmptyState } from './ChatEmptyState';
import { ThreadPanel } from './ThreadPanel';

interface StatusGroup {
  status: TicketStatus;
  messages: ChannelMessage[];
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

interface MessagePanelProps {
  panelTitle: string;
  channelCreatedAt: string | null;
  messages: ChannelMessage[];
  selectedMessageId: string | null;
  attentionMessageIds: Set<string>;
  onOpenThread: (message: ChannelMessage) => void;
  middlePanelView: MiddlePanelView;
  kanbanColumns: KanbanColumnType[];
  kanbanLoading: boolean;
  onMoveTicket: (ticketId: string, columnId: string, sortOrder: number) => void;
  onDeleteMessage?: (messageId: string) => void;
  isFullscreen?: boolean;
  teamProjects?: Channel[];
  onSwitchChannel?: (channelId: string) => void;
}

export function MessagePanel({
  panelTitle,
  channelCreatedAt,
  messages,
  selectedMessageId,
  attentionMessageIds,
  onOpenThread,
  middlePanelView,
  kanbanColumns,
  kanbanLoading,
  onDeleteMessage,
  onMoveTicket,
  isFullscreen,
  teamProjects = [],
  onSwitchChannel,
}: MessagePanelProps) {
  const [projectSubView, setProjectSubView] = useState<'list' | 'board' | 'graph'>('board');
  const feedListRef = useRef<HTMLDivElement | null>(null);

  const ticketByMessageId = useMemo(() => {
    const map = new Map<string, KanbanTicket>();
    for (const col of kanbanColumns) {
      for (const ticket of col.tickets) {
        map.set(ticket.messageId, ticket);
      }
    }
    return map;
  }, [kanbanColumns]);

  const groupedMessages = useMemo(() => {
    const buckets = new Map<TicketStatus, ChannelMessage[]>();
    for (const msg of messages) {
      const status = (msg.status ?? 'pending') as TicketStatus;
      let bucket = buckets.get(status);
      if (!bucket) {
        bucket = [];
        buckets.set(status, bucket);
      }
      bucket.push(msg);
    }

    const groups: StatusGroup[] = [];
    for (const status of STATUS_GROUP_ORDER) {
      const msgs = buckets.get(status);
      if (msgs && msgs.length > 0) {
        groups.push({ status, messages: msgs });
      }
    }
    return groups;
  }, [messages]);

  const nearBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);

  useEffect(() => {
    const prevCount = prevMessageCountRef.current;
    const currCount = messages.length;
    prevMessageCountRef.current = currCount;

    const el = feedListRef.current;
    if (!el) return;

    if (prevCount === 0 || nearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const handleFeedScroll = useCallback(() => {
    const el = feedListRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  const handleBoardClickTicket = useCallback(
    (messageId: string) => {
      const message = messages.find((m) => m.id === messageId);
      if (message) onOpenThread(message);
    },
    [messages, onOpenThread],
  );

  const renderGroupedMessages = (showDelete: boolean) =>
    groupedMessages.map((group) => (
      <CollapsibleStatusGroup
        key={group.status}
        status={group.status}
        count={group.messages.length}
      >
        {group.messages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            ticket={ticketByMessageId.get(message.id) ?? null}
            isSelected={message.id === selectedMessageId}
            needsAttention={attentionMessageIds.has(message.id)}
            onOpenThread={onOpenThread}
            onDeleteMessage={showDelete ? onDeleteMessage : undefined}
            dimmed={message.status === 'merged'}
          />
        ))}
      </CollapsibleStatusGroup>
    ));

  return (
    <div id="messages-panel" className="flex min-h-0 flex-1 flex-col bg-[#1a1b26]" style={{ minWidth: 200 }}>
      {middlePanelView === 'chat' ? (
        messages.length === 0 ? (
          <ChatEmptyState
            channelName={panelTitle.replace(/^#\s*/, '')}
            channelCreatedAt={channelCreatedAt}
          />
        ) : (
          <>
            <div
              ref={feedListRef}
              onScroll={handleFeedScroll}
              className="flex min-h-0 flex-1 flex-col overflow-y-auto py-2"
            >
              {renderGroupedMessages(true)}
            </div>
            <MessageInput />
          </>
        )
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
          <MessageInput />
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
          {!(isFullscreen && selectedMessageId) && (
            <div className="flex min-h-0 flex-1 flex-col" style={{ minWidth: 200 }}>
              <div
                id="workspaces-list"
                ref={feedListRef}
                onScroll={handleFeedScroll}
                className="flex min-h-0 flex-1 flex-col overflow-y-auto py-2"
              >
                {renderGroupedMessages(false)}
              </div>
              <MessageInput />
            </div>
          )}
          <ThreadPanel />
        </div>
      )}
    </div>
  );
}
