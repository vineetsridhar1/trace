import { useCallback, useState } from "react";
import {
  FiPlay,
  FiSquare,
  FiEdit3,
  FiMap,
  FiHelpCircle,
} from "react-icons/fi";
import { useWorkspaceActions } from "../hooks/useWorkspaceActions";
import { useWorkspaceStore } from "../stores/workspaceStore";

type InteractionMode = "code" | "plan" | "ask";

const MODE_CYCLE: InteractionMode[] = ["code", "plan", "ask"];
const MODE_CONFIG: Record<
  InteractionMode,
  {
    label: string;
    icon: React.ReactNode;
    tooltip: string;
    style: string;
  }
> = {
  code: {
    label: "Code",
    icon: <FiEdit3 className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />,
    tooltip: "Code mode – Claude can edit files",
    style: "btn-secondary border-edge text-primary",
  },
  plan: {
    label: "Plan",
    icon: <FiMap className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />,
    tooltip: "Plan mode – Claude plans before coding",
    style: "border-accent bg-accent/20 text-accent-light",
  },
  ask: {
    label: "Ask",
    icon: (
      <FiHelpCircle
        className="h-3.5 w-3.5 flex-shrink-0"
        aria-hidden="true"
      />
    ),
    tooltip: "Ask mode – read-only, no file changes",
    style: "border-amber-500 bg-amber-500/20 text-amber-300",
  },
};

interface WebRunButtonsProps {
  workspaceId: string;
  channelId: string;
  disabled?: boolean;
}

export function WebRunButtons({
  workspaceId,
  channelId,
  disabled,
}: WebRunButtonsProps) {
  const [mode, setMode] = useState<InteractionMode>("code");
  const [starting, setStarting] = useState(false);
  const { startWorkspace, stopCurrentAgent, switchMode } = useWorkspaceActions();

  const workspace = useWorkspaceStore((s) =>
    s.workspaces.find((w) => w.id === workspaceId),
  );
  const isRunning =
    workspace?.status === "in_progress" ||
    workspace?.status === "needs_input";
  const canStart = workspace?.status === "pending";

  const handleStart = useCallback(async () => {
    if (disabled || starting || !workspace) return;
    setStarting(true);
    try {
      await startWorkspace({
        workspaceId,
        prompt: workspace.preview ?? "",
        channelId,
      });
    } finally {
      setStarting(false);
    }
  }, [disabled, starting, workspace, startWorkspace, workspaceId, channelId]);

  const handleStop = useCallback(async () => {
    if (disabled) return;
    await stopCurrentAgent(workspaceId);
  }, [disabled, stopCurrentAgent, workspaceId]);

  const cycleMode = useCallback(() => {
    if (disabled) return;
    const next = MODE_CYCLE[(MODE_CYCLE.indexOf(mode) + 1) % MODE_CYCLE.length];
    setMode(next);
    void switchMode(workspaceId, channelId, next);
  }, [disabled, mode, switchMode, workspaceId, channelId]);

  const config = MODE_CONFIG[mode];

  return (
    <div className="flex items-center gap-1.5">
      {canStart && (
        <button
          type="button"
          onClick={() => void handleStart()}
          disabled={disabled || starting}
          title="Start Claude"
          className="flex items-center gap-1.5 rounded-lg border border-green-500 bg-green-500/20 px-2.5 py-1 text-xs font-medium text-green-400 transition-colors hover:bg-green-500/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FiPlay className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          {starting ? "Starting…" : "Start"}
        </button>
      )}
      {isRunning && (
        <button
          type="button"
          onClick={() => void handleStop()}
          disabled={disabled}
          title="Stop Claude"
          className="flex items-center gap-1.5 rounded-lg border border-red-500 bg-red-500/20 px-2.5 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FiSquare className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          Stop
        </button>
      )}
      <button
        type="button"
        onClick={cycleMode}
        disabled={disabled}
        title={config.tooltip}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${config.style}`}
      >
        {config.icon}
        {config.label}
      </button>
    </div>
  );
}
