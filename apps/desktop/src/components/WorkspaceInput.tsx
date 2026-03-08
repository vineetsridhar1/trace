import { FiCpu, FiPlus } from "react-icons/fi";
import { useAppUIStore } from "../stores/appUIStore";
import { useAgentRunStore } from "../stores/agentRunStore";

export function WorkspaceInput() {
  return (
    <div className="border-t border-edge px-3 py-2 flex gap-2">
      <button
        type="button"
        onClick={() =>
          useAgentRunStore.getState().workspaceActions.createOrchestrator()
        }
        className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-edge px-3 py-1 text-xs font-medium text-secondary hover:bg-surface-elevated"
      >
        <FiCpu className="h-3.5 w-3.5" aria-hidden="true" />
        Orchestrator
      </button>
      <button
        type="button"
        onClick={() => useAppUIStore.getState().setShowNewWorkspaceModal(true)}
        className="btn-primary flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium"
      >
        <FiPlus className="h-3.5 w-3.5" aria-hidden="true" />
        New workspace
        <span className="ml-1 flex items-center gap-0.5 opacity-60">
          <kbd
            className="rounded px-1 py-0.5 text-[10px]"
            style={{ background: "rgba(0,0,0,0.15)" }}
          >
            &#8984;
          </kbd>
          <kbd
            className="rounded px-1 py-0.5 text-[10px]"
            style={{ background: "rgba(0,0,0,0.15)" }}
          >
            N
          </kbd>
        </span>
      </button>
    </div>
  );
}
