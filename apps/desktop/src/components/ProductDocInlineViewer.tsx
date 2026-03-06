import { useState } from 'react';
import { FiFileText, FiCode, FiGitBranch } from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { SessionRenderNode, SessionStatus } from '../types';
import { AgentContent } from './tiling/PaneContent';
import { TicketGraph } from './TicketGraph';
import { useProductDocFilePolling } from '../hooks/useProductDocFilePolling';
import { useAppUIStore } from '../stores/appUIStore';

const REMARK_PLUGINS = [remarkGfm] as const;

type ActiveTab = 'chat' | 'prd' | 'tech' | 'tickets';

interface ProductDocInlineViewerProps {
  worktreePath: string | null;
  selectedWorkspaceId: string | null;
  // AgentContent pass-through props
  threadContentRef: React.RefObject<HTMLDivElement | null>;
  onThreadScroll: () => void;
  sessionNodes: SessionRenderNode[];
  sessionStatus: SessionStatus;
  activeSessionId: string | null;
  loadingOlderEvents: boolean;
  expandedReadGroupIds: Record<string, boolean>;
  expandedTurnGroupIds: Record<string, boolean>;
  toggleReadGroup: (id: string) => void;
  toggleTurnGroup: (id: string) => void;
  showJumpToLatest: boolean;
  scrollToLatest: () => void;
}

const tabs: Array<{ key: ActiveTab; label: string }> = [
  { key: 'chat', label: 'Chat' },
  { key: 'prd', label: 'Product Scoping' },
  { key: 'tech', label: 'Tech Scoping' },
  { key: 'tickets', label: 'Tickets' },
];

export function ProductDocInlineViewer({
  worktreePath,
  selectedWorkspaceId,
  threadContentRef,
  onThreadScroll,
  sessionNodes,
  sessionStatus,
  activeSessionId,
  loadingOlderEvents,
  expandedReadGroupIds,
  expandedTurnGroupIds,
  toggleReadGroup,
  toggleTurnGroup,
  showJumpToLatest,
  scrollToLatest,
}: ProductDocInlineViewerProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('chat');
  const [ticketView, setTicketView] = useState<'code' | 'graph'>('code');

  const { prdContent, techContent, ticketsContent, hasPrd, hasTech, hasTickets, parsedTickets } =
    useProductDocFilePolling(worktreePath);

  const isTabEnabled = (key: ActiveTab): boolean => {
    if (key === 'chat') return true;
    if (key === 'prd') return hasPrd;
    if (key === 'tech') return hasTech;
    if (key === 'tickets') return hasTickets;
    return false;
  };

  const handleOpenProductDoc = () => {
    if (!selectedWorkspaceId) return;
    const mode = hasTickets ? 'tickets' : hasTech ? 'tech-scope' : 'prd';
    const s = useAppUIStore.getState();
    s.setActiveProductDocId(selectedWorkspaceId);
    s.setActiveAiChatId(null);
    s.setProductDocMode(mode);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Open Product Scoping button */}
      <div className="shrink-0 border-b border-edge px-4 py-2.5">
        <button
          type="button"
          onClick={handleOpenProductDoc}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90 transition-opacity"
        >
          <FiFileText className="h-4 w-4" />
          Open Product Scoping
        </button>
      </div>

      {/* Tab bar */}
      <div className="shrink-0 border-b border-edge px-4 py-1.5">
        <div className="flex items-center rounded-full bg-surface-elevated p-0.5">
          {tabs.map(({ key, label }) => {
            const enabled = isTabEnabled(key);
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                disabled={!enabled}
                onClick={() => enabled && setActiveTab(key)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-accent/20 text-accent-light'
                    : !enabled
                      ? 'text-faint cursor-not-allowed'
                      : 'text-muted hover:text-primary'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content area */}
      {activeTab === 'chat' ? (
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
          scrollToLatest={scrollToLatest}
        />
      ) : activeTab === 'tickets' ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Code/Graph toggle */}
          <div className="flex items-center justify-end border-b border-edge px-4 py-1.5">
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
          </div>
          {ticketView === 'graph' ? (
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
              {ticketsContent.trim() ? (
                <div className="markdown-body text-sm text-primary leading-relaxed max-w-prose break-words overflow-hidden">
                  <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>
                    {`\`\`\`json\n${ticketsContent}\n\`\`\``}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm text-faint">No tickets generated yet.</p>
              )}
            </div>
          )}
        </div>
      ) : (
        /* prd or tech tab */
        <div className="flex-1 overflow-y-auto bg-surface-deep px-6 py-4">
          {(() => {
            const content = activeTab === 'prd' ? prdContent : techContent;
            return content.trim() ? (
              <div className="markdown-body text-sm text-primary leading-relaxed max-w-prose break-words overflow-hidden">
                <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>
                  {content}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="text-sm text-faint">
                Document not yet generated.
              </p>
            );
          })()}
        </div>
      )}
    </div>
  );
}
