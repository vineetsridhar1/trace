import type { ThreadRenderNode, ThreadStatus } from '../types';
import { ThreadPanel } from './ThreadPanel';
import { WorktreeChanges } from './WorktreeChanges';
import { Terminal } from './Terminal';

interface FullscreenViewProps {
  messageId: string | null;
  worktreePath: string;
  threadProps: FullscreenThreadProps;
}

interface FullscreenThreadProps {
  threadStatus: ThreadStatus;
  activeThreadId: string | null;
  threadNodes: ThreadRenderNode[];
  expandedReadGroupIds: Record<string, boolean>;
  selectedMessageId: string | null;
  deletingWorktree: boolean;
  hasWorktree: boolean | null;
  showJumpToLatest: boolean;
  threadInput: string;
  isClaudeRunning: boolean;
  threadContentRef: React.RefObject<HTMLDivElement | null>;
  onThreadScroll: () => void;
  onToggleReadGroup: (groupId: string) => void;
  onScrollToLatest: () => void;
  onDeleteWorktree: () => void;
  onMergeToMain: () => void;
  onThreadInputChange: (value: string) => void;
  onSendThreadMessage: () => void;
  onPlanResponse: (text: string) => void;
  onExitFullscreen: () => void;
}

export function FullscreenView({ messageId, worktreePath, threadProps }: FullscreenViewProps) {
  const terminalId = `fullscreen-${messageId ?? 'none'}`;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#1a1b26] text-[#c0caf5]">
      <div className="flex h-full w-1/2 min-w-0 flex-col border-r border-[#292e42]">
        <ThreadPanel
          threadWidth={9999}
          dragging={null}
          threadStatus={threadProps.threadStatus}
          activeThreadId={threadProps.activeThreadId}
          threadNodes={threadProps.threadNodes}
          expandedReadGroupIds={threadProps.expandedReadGroupIds}
          selectedMessageId={threadProps.selectedMessageId}
          deletingWorktree={threadProps.deletingWorktree}
          hasWorktree={threadProps.hasWorktree}
          showJumpToLatest={threadProps.showJumpToLatest}
          threadInput={threadProps.threadInput}
          isClaudeRunning={threadProps.isClaudeRunning}
          threadContentRef={threadProps.threadContentRef}
          onThreadScroll={threadProps.onThreadScroll}
          onToggleReadGroup={threadProps.onToggleReadGroup}
          onScrollToLatest={threadProps.onScrollToLatest}
          onClose={threadProps.onExitFullscreen}
          onDeleteWorktree={threadProps.onDeleteWorktree}
          onMergeToMain={threadProps.onMergeToMain}
          onThreadInputChange={threadProps.onThreadInputChange}
          onSendThreadMessage={threadProps.onSendThreadMessage}
          onPlanResponse={threadProps.onPlanResponse}
          onStartDrag={() => {}}
          isFullscreen
          onEnterFullscreen={() => {}}
          onExitFullscreen={threadProps.onExitFullscreen}
        />
      </div>

      <div className="flex h-full w-1/2 min-w-0 flex-col">
        <div className="min-h-0 flex-1 overflow-hidden border-b border-[#292e42]">
          <WorktreeChanges messageId={messageId} />
        </div>
        <div className="h-[40%] min-h-[150px] overflow-hidden">
          <Terminal terminalId={terminalId} cwd={worktreePath} />
        </div>
      </div>
    </div>
  );
}
