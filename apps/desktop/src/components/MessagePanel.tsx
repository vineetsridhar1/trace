import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FiChevronRight,
  FiColumns,
  FiFolder,
  FiList,
  FiSend,
  FiShare2,
  FiUser,
} from "react-icons/fi";
import type {
  Channel,
  PullRequest,
  Workspace,
  KanbanColumn as KanbanColumnType,
  KanbanTicket,
  MiddlePanelView,
} from "../types";
import { KanbanBoard } from "./KanbanBoard";
import { MessageItem } from "./MessageItem";
import { ChatEmptyState } from "./ChatEmptyState";
import { ThreadLinkPreview } from "./ThreadLinkPreview";
import { PullRequestListView } from "./PullRequestListView";
import { TicketDetailModal } from "./TicketDetailModal";
import { useChannelMessages } from "../hooks/useChannelMessages";
import { useAuth } from "../context/AuthContext";
import { useAgentRunStore } from "../stores/agentRunStore";

const THREAD_LINK_RE =
  /https?:\/\/[^\s/]+\/thread\/([a-f0-9-]+)\/([a-f0-9-]+)/g;

function renderMessageContent(
  content: string,
  onNavigateToThread: (channelId: string, workspaceId: string) => void,
): React.ReactNode {
  const segments: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  THREAD_LINK_RE.lastIndex = 0;
  while ((match = THREAD_LINK_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push(
        <span key={key++} className="whitespace-pre-wrap">
          {content.slice(lastIndex, match.index)}
        </span>,
      );
    }
    const channelId = match[1];
    const workspaceId = match[2];
    segments.push(
      <ThreadLinkPreview
        key={key++}
        channelId={channelId}
        workspaceId={workspaceId}
        onNavigate={onNavigateToThread}
      />,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex === 0) {
    return <span className="whitespace-pre-wrap">{content}</span>;
  }

  if (lastIndex < content.length) {
    segments.push(
      <span key={key++} className="whitespace-pre-wrap">
        {content.slice(lastIndex)}
      </span>,
    );
  }

  return segments;
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

function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
  onMarkMerged?: (workspaceId: string) => void;
  isFullscreen?: boolean;
  teamProjects?: Channel[];
  onSwitchChannel?: (channelId: string) => void;
  workspacesWithRunningProcesses?: Set<string>;
  activeRunWorkspaceIds?: Set<string>;
  needsJoin?: boolean;
  onJoinChannel?: () => void;
  onOpenThreadLink?: (channelId: string, workspaceId: string) => void;
  repoPath?: string | null;
  onPullPR?: (pr: PullRequest) => void;
  pullingPRNumbers?: Set<number>;
  workspacesLoading?: boolean;
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
  onMarkMerged,
  onMoveTicket,
  isFullscreen,
  teamProjects = [],
  onSwitchChannel,
  workspacesWithRunningProcesses,
  activeRunWorkspaceIds,
  needsJoin,
  onJoinChannel,
  onOpenThreadLink,
  repoPath,
  onPullPR,
  pullingPRNumbers,
  workspacesLoading,
}: MessagePanelProps) {
  const [projectSubView, setProjectSubView] = useState<
    "list" | "board" | "graph"
  >("board");
  const [selectedTicket, setSelectedTicket] = useState<KanbanTicket | null>(
    null,
  );
  const [showMyTicketsOnly, setShowMyTicketsOnly] = useState(false);
  const { user: authUser } = useAuth();
  const filteredKanbanColumns = useMemo(() => {
    if (!showMyTicketsOnly || !authUser?.id) return kanbanColumns;
    return kanbanColumns.map((col) => ({
      ...col,
      tickets: col.tickets.filter(
        (t) => t.workspace?.userId === authUser.id,
      ),
    }));
  }, [kanbanColumns, showMyTicketsOnly, authUser?.id]);

  const ticketByWorkspaceId = useMemo(() => {
    const map = new Map<string, KanbanTicket>();
    for (const col of kanbanColumns) {
      for (const ticket of col.tickets) {
        if (ticket.workspaceId) map.set(ticket.workspaceId, ticket);
      }
    }
    return map;
  }, [kanbanColumns]);

  const documentWorkspaces = useMemo(
    () => workspaces.filter((ws) => ws.isProductDoc),
    [workspaces],
  );

  const handleBoardClickTicket = useCallback((ticket: KanbanTicket) => {
    setSelectedTicket(ticket);
  }, []);

  const handleBoardCreatePR = useCallback(
    (workspaceId: string) => {
      // Open the workspace first, then send the /create-pr command
      const workspace = workspaces.find((m) => m.id === workspaceId);
      if (workspace) onOpenWorkspace(workspace);
      // Send after a microtask so the workspace is selected
      queueMicrotask(() => {
        const { sendThreadMessage } =
          useAgentRunStore.getState().workspaceActions;
        void sendThreadMessage("/create-pr", [], []);
      });
    },
    [workspaces, onOpenWorkspace],
  );

  // Channel messaging
  const { messages: chatMessages, sendMessage: sendChatMessage } =
    useChannelMessages(channelId);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const chatNearBottomRef = useRef(true);
  const [chatInput, setChatInput] = useState("");

  // Animation tracking for new messages
  const renderedIdsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef(true);
  const prevChannelIdRef = useRef<string | null>(null);

  // Reset animation tracking on channel switch
  if (channelId !== prevChannelIdRef.current) {
    prevChannelIdRef.current = channelId;
    renderedIdsRef.current = new Set();
    isInitialLoadRef.current = true;
    chatNearBottomRef.current = true;
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

  // Scroll to bottom when channel changes
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [channelId]);

  // Auto-scroll chat on new messages
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    if (chatNearBottomRef.current) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [chatMessages]);

  const handleChatScroll = useCallback(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    chatNearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  const handleSendChat = useCallback(() => {
    if (!chatInput.trim()) return;
    void sendChatMessage(chatInput);
    setChatInput("");
    chatNearBottomRef.current = true;
    requestAnimationFrame(() => {
      const el = chatScrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [chatInput, sendChatMessage]);

  const handleChatKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendChat();
      }
    },
    [handleSendChat],
  );

  if (needsJoin) {
    const channelName = panelTitle.replace(/^#\s*/, "");
    return (
      <div
        id="messages-panel"
        className="flex min-h-0 flex-1 flex-col items-center justify-center bg-surface"
        style={{ minWidth: 200 }}
      >
        <div className="flex max-w-sm flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
            <FiFolder className="h-6 w-6 text-accent" />
          </div>
          <h3 className="mb-2 text-base font-semibold text-primary">
            Join #{channelName}
          </h3>
          <p className="mb-5 text-sm text-muted">
            Connect your local repository to start creating workspaces in this
            channel.
          </p>
          <button
            type="button"
            onClick={onJoinChannel}
            className="btn-primary rounded-md px-4 py-2 text-sm font-medium text-on-accent"
          >
            Set Up Local Repo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      id="messages-panel"
      className="flex min-h-0 flex-1 flex-col bg-surface"
      style={{ minWidth: 200 }}
    >
      {middlePanelView === "chat" ? (
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
                channelName={panelTitle.replace(/^#\s*/, "")}
                channelCreatedAt={channelCreatedAt}
              />
              {/* Message list */}
              <div className="px-3 py-2">
                {chatMessages.map((msg, i) => {
                  const isOwn = authUser?.id === msg.author.id;
                  const isNew = newMessageIds.has(msg.id);
                  const isFirstInGroup =
                    i === 0 || chatMessages[i - 1].author.id !== msg.author.id;
                  return (
                    <div
                      key={msg.id}
                      className={`${isFirstInGroup ? `mb-3 ${i === 0 ? "mt-0" : "mt-3"}` : "mb-0.5"} flex items-start gap-2${isNew ? " message-enter" : ""}`}
                    >
                      {isFirstInGroup ? (
                        msg.author.avatarUrl ? (
                          <img
                            src={msg.author.avatarUrl}
                            alt={msg.author.name}
                            className="mt-0.5 h-6 w-6 flex-shrink-0 rounded-full"
                          />
                        ) : (
                          <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent/30 text-[10px] font-bold text-accent-light">
                            {msg.author.name.charAt(0).toUpperCase()}
                          </div>
                        )
                      ) : (
                        <div className="h-0 w-6 flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        {isFirstInGroup && (
                          <div className="flex items-baseline gap-2">
                            <span
                              className={`text-xs font-semibold ${isOwn ? "text-accent-light" : "text-primary"}`}
                            >
                              {msg.author.name}
                            </span>
                            <span className="text-[10px] text-muted">
                              {formatMessageTime(msg.createdAt)}
                            </span>
                          </div>
                        )}
                        <div className="text-sm text-primary">
                          {onOpenThreadLink ? (
                            renderMessageContent(msg.content, onOpenThreadLink)
                          ) : (
                            <span className="whitespace-pre-wrap">
                              {msg.content}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          {/* Input */}
          <div className="border-t border-edge px-3 py-3">
            <div className="flex items-end gap-2">
              <textarea
                rows={1}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                placeholder="Send a message..."
                style={
                  {
                    fieldSizing: "content",
                    minHeight: 38,
                    maxHeight: 300,
                  } as React.CSSProperties
                }
                className="w-full resize-none rounded-md border border-edge bg-surface-elevated px-3 py-2 text-sm text-primary outline-none placeholder:text-muted focus:border-edge-hover"
              />
              <button
                type="button"
                onClick={handleSendChat}
                disabled={!chatInput.trim()}
                className="flex h-[38px] w-[38px] flex-shrink-0 cursor-pointer items-center justify-center rounded-md bg-accent/20 text-accent-light transition-colors hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FiSend className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : middlePanelView === "board" ? (
        <>
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="flex rounded-lg bg-surface-elevated p-0.5">
              {(
                [
                  { key: "list", label: "List", icon: FiList },
                  { key: "board", label: "Board", icon: FiColumns },
                  { key: "graph", label: "Graph", icon: FiShare2 },
                ] as const
              ).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setProjectSubView(key)}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    projectSubView === key
                      ? "bg-accent/20 text-accent-light"
                      : "text-muted hover:text-primary"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowMyTicketsOnly((v) => !v)}
              className={`flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                showMyTicketsOnly
                  ? "bg-accent/20 text-accent-light"
                  : "text-muted hover:text-primary"
              }`}
            >
              <FiUser className="h-3.5 w-3.5" />
              My Tickets
            </button>
          </div>
          {projectSubView === "board" ? (
            <KanbanBoard
              columns={filteredKanbanColumns}
              loading={kanbanLoading}
              onClickTicket={handleBoardClickTicket}
              onMoveTicket={onMoveTicket}
              onDeleteWorkspace={onDeleteWorkspace}
              onCreatePR={handleBoardCreatePR}
            />
          ) : projectSubView === "list" ? (
            <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted">
              List view coming soon
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted">
              Graph view coming soon
            </div>
          )}
        </>
      ) : middlePanelView === "projects" ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {teamProjects.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted">
              No projects associated with this team
            </div>
          ) : (
            <div className="flex flex-col py-2">
              {teamProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => onSwitchChannel?.(project.id)}
                  className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-elevated"
                >
                  <span className="text-muted text-sm">#</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-primary">
                      {project.name}
                    </div>
                  </div>
                  <FiChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted" />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : middlePanelView === "pull-requests" ? (
        <PullRequestListView
          repoPath={repoPath ?? null}
          onPullPR={onPullPR ?? (() => {})}
          onOpenWorkspace={onOpenWorkspace}
          workspaces={workspaces}
          pullingPRNumbers={pullingPRNumbers ?? new Set()}
        />
      ) : middlePanelView === "documents" ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto py-2">
          {workspacesLoading && documentWorkspaces.length === 0 ? (
            <WorkspaceListSkeleton />
          ) : documentWorkspaces.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted">
              No documents yet
            </div>
          ) : (
            documentWorkspaces.map((workspace) => (
              <MessageItem
                key={workspace.id}
                workspace={workspace}
                ticket={ticketByWorkspaceId.get(workspace.id) ?? null}
                isSelected={workspace.id === selectedWorkspaceId}
                needsAttention={attentionWorkspaceIds.has(workspace.id)}
                onOpenWorkspace={onOpenWorkspace}
                onDeleteWorkspace={onDeleteWorkspace}
                hasRunningProcess={workspacesWithRunningProcesses?.has(workspace.id)}
                activelyRunning={activeRunWorkspaceIds?.has(workspace.id)}
              />
            ))
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted">
          Use the workspace sidebar to browse workspaces
        </div>
      )}
      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
          onOpenWorkspace={
            selectedTicket.workspaceId &&
            workspaces.some((w) => w.id === selectedTicket.workspaceId)
              ? () => {
                  const workspace = workspaces.find(
                    (w) => w.id === selectedTicket.workspaceId,
                  );
                  setSelectedTicket(null);
                  if (workspace) onOpenWorkspace(workspace);
                }
              : undefined
          }
          onCreateWorkspace={
            !selectedTicket.workspaceId
              ? () => {
                  const ticket = selectedTicket;
                  setSelectedTicket(null);
                  void useAgentRunStore
                    .getState()
                    .workspaceActions.createWorkspaceForTicket(ticket);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
