import { useEffect, useMemo, useState } from 'react';
import { FiArrowLeft, FiFileText, FiCpu, FiSquare, FiCode, FiGitBranch, FiDownload } from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AgentContent } from './tiling/PaneContent';
import { ThreadInput } from './ThreadInput';
import { AskUserQuestionBar } from './AskUserQuestionBar';
import { Spinner } from './Spinner';
import { ImportToProjectModal } from './ImportToProjectModal';
import { useChannelContext } from '../context/ChannelContext';
import { useThreadStore } from '../stores/threadStore';
import { useAgentRunStore } from '../stores/agentRunStore';
import { useAppUIStore } from '../stores/appUIStore';
import { useThreadScroll } from '../hooks/useThreadScroll';
import { buildSessionNodes } from '../utils';
import type { AskUserQuestionNode } from '../types';
import { TicketGraph } from './TicketGraph';

interface ProductDocViewProps {
  onBack: () => void;
  onGenerateTechScope?: () => void;
  onGenerateTickets?: () => void;
}

export function ProductDocView({ onBack, onGenerateTechScope, onGenerateTickets }: ProductDocViewProps) {
  const productDocMode = useAppUIStore((s) => s.productDocMode);
  const worktreePath = useThreadStore((s) => s.worktreePath);
  const [docContent, setDocContent] = useState('');
  const [ticketView, setTicketView] = useState<'code' | 'graph'>('code');
  const [showImportModal, setShowImportModal] = useState(false);
  const [productDocBranch, setProductDocBranch] = useState<string | null>(null);

  const {
    enrichedActiveChannel,
    activeServerId,
    switchChannel,
    setLocalConfig,
    getLocalConfig,
  } = useChannelContext();

  const isTechScope = productDocMode === 'tech-scope';
  const isTickets = productDocMode === 'tickets';
  const fileName = isTickets
    ? 'tickets.json'
    : isTechScope
      ? 'technical-scoping.md'
      : 'product-scoping.md';
  const filePath = worktreePath
    ? `${worktreePath}/.trace/${fileName}`
    : null;

  // ─── Thread store state ─────────────────────────────────────────
  const selectedWorkspaceId = useThreadStore((s) => s.selectedWorkspaceId);
  const sessionEvents = useThreadStore((s) => s.sessionEvents);
  const sessionStatus = useThreadStore((s) => s.sessionStatus);
  const activeSessionId = useThreadStore((s) => s.activeSessionId);
  const loadingOlderEvents = useThreadStore((s) => s.loadingOlderEvents);
  const expandedReadGroupIds = useThreadStore((s) => s.expandedReadGroupIds);
  const expandedTurnGroupIds = useThreadStore((s) => s.expandedTurnGroupIds);
  const toggleReadGroup = useThreadStore((s) => s.toggleReadGroup);
  const toggleTurnGroup = useThreadStore((s) => s.toggleTurnGroup);
  const clearSession = useThreadStore((s) => s.syncActions.clearSession);

  // ─── Agent run store state ──────────────────────────────────────
  const activeRunWorkspaceIds = useAgentRunStore((s) => s.activeRunWorkspaceIds);
  const spawnedWorkspaceIds = useAgentRunStore((s) => s.spawnedWorkspaceIds);
  const stopAgent = useAgentRunStore((s) => s.workspaceActions.stopAgent);
  const sendThreadMessage = useAgentRunStore(
    (s) => s.workspaceActions.sendThreadMessage,
  );
  const sendPlanResponse = useAgentRunStore(
    (s) => s.workspaceActions.sendPlanResponse,
  );

  // ─── Derived state ─────────────────────────────────────────────
  const sessionNodes = useMemo(
    () => buildSessionNodes(sessionEvents),
    [sessionEvents],
  );

  const isAgentRunning = useMemo(() => {
    if (!selectedWorkspaceId) return false;
    if (activeRunWorkspaceIds.has(selectedWorkspaceId)) return true;
    if (!spawnedWorkspaceIds.has(selectedWorkspaceId)) return false;
    if (sessionStatus === 'empty') return false;
    const lastEvent = sessionEvents[sessionEvents.length - 1];
    if (lastEvent?.hookEventName === 'Stop') return false;
    return true;
  }, [
    selectedWorkspaceId,
    activeRunWorkspaceIds,
    spawnedWorkspaceIds,
    sessionEvents,
    sessionStatus,
  ]);

  const lastUserMessageTime = useMemo(() => {
    for (let i = sessionNodes.length - 1; i >= 0; i--) {
      const node = sessionNodes[i];
      if (
        node.kind === 'event' &&
        node.event.hookEventName === 'UserPromptSubmit'
      ) {
        return node.event.timestamp;
      }
    }
    return null;
  }, [sessionNodes]);

  // ─── Active question detection ─────────────────────────────────
  const activeQuestionNode = useMemo((): AskUserQuestionNode | null => {
    if (isAgentRunning) return null;
    for (let i = sessionNodes.length - 1; i >= 0; i--) {
      const node = sessionNodes[i];
      if (node.kind === 'ask-user-question') return node;
      if (
        node.kind === 'event' &&
        node.event.hookEventName === 'UserPromptSubmit'
      ) {
        break;
      }
    }
    return null;
  }, [sessionNodes, isAgentRunning]);

  const [dismissedQuestionId, setDismissedQuestionId] = useState<string | null>(
    null,
  );
  const showQuestion =
    activeQuestionNode && activeQuestionNode.id !== dismissedQuestionId
      ? activeQuestionNode
      : null;

  // ─── Scroll management ─────────────────────────────────────────
  const {
    threadContentRef,
    showJumpToLatest,
    scrollThreadToBottom,
    onThreadScroll,
  } = useThreadScroll();

  // ─── Parsed tickets for graph view ────────────────────────────
  const parsedTickets = useMemo(() => {
    if (!isTickets || !docContent.trim()) return [];
    try {
      const parsed = JSON.parse(docContent);
      if (Array.isArray(parsed)) return parsed;
      return [];
    } catch {
      return [];
    }
  }, [isTickets, docContent]);

  // ─── File polling ──────────────────────────────────────────────
  useEffect(() => {
    if (!filePath) return;

    const poll = async () => {
      try {
        const result = await window.traceAPI.readProductDocFile(filePath);
        if (result.success && result.content !== undefined) {
          // Pretty-print JSON files (e.g. tickets.json)
          if (filePath.endsWith('.json')) {
            try {
              setDocContent(JSON.stringify(JSON.parse(result.content), null, 2));
            } catch {
              setDocContent(result.content);
            }
          } else {
            setDocContent(result.content);
          }
        }
      } catch {
        // ignore read errors
      }
    };

    void poll();
    const interval = setInterval(() => void poll(), 2000);
    return () => clearInterval(interval);
  }, [filePath]);

  // ─── Resolve product doc worktree branch ──────────────────────
  useEffect(() => {
    if (!selectedWorkspaceId) {
      setProductDocBranch(null);
      return;
    }
    window.traceAPI
      .getWorktreeBranch(selectedWorkspaceId)
      .then((result) => {
        setProductDocBranch(result.success && result.branch ? result.branch : null);
      })
      .catch(() => setProductDocBranch(null));
  }, [selectedWorkspaceId]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-edge px-4 py-2.5">
        <button
          type="button"
          onClick={onBack}
          className="rounded p-1 text-muted hover:bg-surface-elevated hover:text-primary"
        >
          <FiArrowLeft className="h-4 w-4" />
        </button>
        <FiFileText className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-primary">
          {isTickets ? 'Tickets' : isTechScope ? 'Technical Scoping' : 'Product Document'}
        </h2>
        {filePath && (
          <span className="text-xs text-muted truncate">{filePath.split('/').pop()}</span>
        )}
      </div>

      {/* Split view: editor left, chat right */}
      <div className="flex min-h-0 flex-1">
        {/* Left: Markdown document */}
        <div className="flex flex-1 flex-col border-r border-edge">
          <div className="flex items-center justify-between border-b border-edge px-4 py-2">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">
              Document
            </span>
            {isTickets && (
              <div className="flex items-center rounded-full bg-surface-elevated p-0.5">
                <button
                  type="button"
                  onClick={() => setTicketView('code')}
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    ticketView === 'code'
                      ? 'bg-accent/20 text-accent-light'
                      : 'text-muted hover:text-primary'
                  }`}
                >
                  <FiCode className="h-3 w-3" />
                  Code
                </button>
                <button
                  type="button"
                  onClick={() => setTicketView('graph')}
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    ticketView === 'graph'
                      ? 'bg-accent/20 text-accent-light'
                      : 'text-muted hover:text-primary'
                  }`}
                >
                  <FiGitBranch className="h-3 w-3" />
                  Graph
                </button>
              </div>
            )}
          </div>
          {isTickets && ticketView === 'graph' ? (
            <div className="flex-1 overflow-hidden bg-surface-deep">
              {parsedTickets.length > 0 ? (
                <TicketGraph tickets={parsedTickets} />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-faint">No tickets to display</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto bg-surface-deep px-6 py-4">
              {docContent.trim() ? (
                <div className="markdown-body text-sm text-primary leading-relaxed max-w-prose break-words overflow-hidden">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {isTickets ? `\`\`\`json\n${docContent}\n\`\`\`` : docContent}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm text-faint">
                  The AI will write the document here as you collaborate...
                </p>
              )}
            </div>
          )}
          {onGenerateTechScope && !isTechScope && !isTickets && docContent.trim() && (
            <div className="shrink-0 border-t border-edge bg-surface px-6 py-4">
              <button
                type="button"
                onClick={onGenerateTechScope}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90 transition-opacity"
              >
                <FiCpu className="h-4 w-4" />
                Generate Technical Scoping
              </button>
            </div>
          )}
          {onGenerateTickets && isTechScope && docContent.trim() && (
            <div className="shrink-0 border-t border-edge bg-surface px-6 py-4">
              <button
                type="button"
                onClick={onGenerateTickets}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90 transition-opacity"
              >
                <FiCpu className="h-4 w-4" />
                Generate Tickets
              </button>
            </div>
          )}
          {isTickets && ticketView === 'graph' && parsedTickets.length > 0 && (
            <div className="shrink-0 border-t border-edge bg-surface px-6 py-4">
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent hover:opacity-90 transition-opacity"
              >
                <FiDownload className="h-4 w-4" />
                Import to Project
              </button>
            </div>
          )}
        </div>

        {/* Right: Agent messages + input */}
        <div className="flex w-[480px] shrink-0 flex-col overflow-hidden">
          <AgentContent
            threadContentRef={threadContentRef}
            onThreadScroll={onThreadScroll}
            sessionNodes={sessionNodes}
            sessionStatus={sessionStatus}
            activeSessionId={activeSessionId}
            loadingOlderEvents={loadingOlderEvents}
            expandedReadGroupIds={expandedReadGroupIds}
            expandedTurnGroupIds={expandedTurnGroupIds}
            toggleReadGroup={toggleReadGroup}
            toggleTurnGroup={toggleTurnGroup}
            showJumpToLatest={showJumpToLatest}
            scrollToLatest={() => scrollThreadToBottom('smooth')}
          />
          {showQuestion ? (
            <AskUserQuestionBar
              node={showQuestion}
              onResponse={(text) => {
                void sendPlanResponse(text, 'keep-context');
              }}
              onDismiss={() => {
                setDismissedQuestionId(showQuestion.id);
                void stopAgent();
              }}
            />
          ) : isAgentRunning ? (
            <div className="flex items-center justify-between border-t border-edge px-4 py-3">
              <div className="flex items-center gap-2">
                <Spinner className="h-3.5 w-3.5 flex-shrink-0 text-accent-light" />
                <span className="text-xs text-muted">Claude is working...</span>
              </div>
              <button
                type="button"
                onClick={() => void stopAgent()}
                className="flex items-center gap-1.5 rounded-md bg-surface-elevated px-3 py-1.5 text-xs font-medium text-primary hover:bg-edge transition-colors"
              >
                <FiSquare className="h-3 w-3" />
                Stop
              </button>
            </div>
          ) : (
            <ThreadInput
              isAgentRunning={isAgentRunning}
              lastUserMessageTime={lastUserMessageTime}
              onSendThreadMessage={sendThreadMessage}
              onStopAgent={() => void stopAgent()}
              onClearThread={clearSession}
            />
          )}
        </div>
      </div>
      {showImportModal && enrichedActiveChannel && activeServerId && (
        <ImportToProjectModal
          tickets={parsedTickets}
          sourceChannel={enrichedActiveChannel}
          serverId={activeServerId}
          localConfig={getLocalConfig(enrichedActiveChannel.id)}
          scopingDocsPath={worktreePath ? `${worktreePath}/.trace` : null}
          productDocBranch={productDocBranch}
          onClose={() => setShowImportModal(false)}
          onImported={(channelId) => {
            setShowImportModal(false);
            useAppUIStore.getState().setActiveProductDocId(null);
            useAppUIStore.getState().setProductDocMode('prd');
            useAppUIStore.getState().setMiddlePanelView('board');
            switchChannel(channelId);
          }}
          onLocalConfigSave={setLocalConfig}
        />
      )}
    </div>
  );
}
