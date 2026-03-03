import { FiPlus } from 'react-icons/fi';
import { useClaudeRunStore } from '../stores/claudeRunStore';

export function WorkspaceInput() {
  const createWorkspace = useClaudeRunStore((s) => s.workspaceActions.createWorkspace);

  return (
    <div className="border-t border-edge px-3 py-2">
      <button
        type="button"
        onClick={() => void createWorkspace()}
        className="btn-primary flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium"
      >
        <FiPlus className="h-3.5 w-3.5" aria-hidden="true" />
        New workspace
        <span className="ml-1 flex items-center gap-0.5 opacity-60">
          <kbd className="rounded px-1 py-0.5 text-[10px]" style={{ background: 'rgba(0,0,0,0.15)' }}>&#8984;</kbd>
          <kbd className="rounded px-1 py-0.5 text-[10px]" style={{ background: 'rgba(0,0,0,0.15)' }}>N</kbd>
        </span>
      </button>
    </div>
  );
}
