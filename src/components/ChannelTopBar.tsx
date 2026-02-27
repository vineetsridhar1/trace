import { FiSettings } from 'react-icons/fi';
import { Tooltip } from './Tooltip';
import type { MiddlePanelView } from '../types';

interface ChannelTopBarProps {
  panelTitle: string;
  middlePanelView: MiddlePanelView;
  onSetView: (view: MiddlePanelView) => void;
  onOpenSettings: () => void;
}

export function ChannelTopBar({
  panelTitle,
  middlePanelView,
  onSetView,
  onOpenSettings,
}: ChannelTopBarProps) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-[#292e42] px-4 py-3">
      <h2 id="panel-title" className="text-sm font-semibold text-violet-300">
        {panelTitle}
      </h2>
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg bg-[#1f2335] p-0.5">
          <button
            type="button"
            onClick={() => onSetView('chat')}
            className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              middlePanelView === 'chat'
                ? 'bg-violet-500/20 text-violet-300'
                : 'text-[#565f89] hover:text-[#a9b1d6]'
            }`}
          >
            Chat
          </button>
          <button
            type="button"
            onClick={() => onSetView('board')}
            className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              middlePanelView === 'board'
                ? 'bg-violet-500/20 text-violet-300'
                : 'text-[#565f89] hover:text-[#a9b1d6]'
            }`}
          >
            Project
          </button>
          <button
            type="button"
            onClick={() => onSetView('workspaces')}
            className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              middlePanelView === 'workspaces'
                ? 'bg-violet-500/20 text-violet-300'
                : 'text-[#565f89] hover:text-[#a9b1d6]'
            }`}
          >
            Workspaces
          </button>
        </div>
        <Tooltip text="Channel settings" position="bottom">
          <button
            type="button"
            onClick={onOpenSettings}
            className="cursor-pointer rounded p-1 text-[#565f89] hover:bg-[#292e42] hover:text-[#c0caf5] transition-colors"
          >
            <FiSettings className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
