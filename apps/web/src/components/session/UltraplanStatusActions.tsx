import { useState } from "react";
import { gql } from "@urql/core";
import { Pause, Play, RotateCw, Square } from "lucide-react";
import { toast } from "sonner";
import { client } from "../../lib/urql";

const PAUSE_ULTRAPLAN_MUTATION = gql`
  mutation PauseUltraplanFromGroup($id: ID!) {
    pauseUltraplan(id: $id) {
      id
    }
  }
`;

const RESUME_ULTRAPLAN_MUTATION = gql`
  mutation ResumeUltraplanFromGroup($id: ID!) {
    resumeUltraplan(id: $id) {
      id
    }
  }
`;

const RUN_ULTRAPLAN_CONTROLLER_MUTATION = gql`
  mutation RunUltraplanControllerFromGroup($id: ID!) {
    runUltraplanControllerNow(id: $id) {
      id
    }
  }
`;

const CANCEL_ULTRAPLAN_MUTATION = gql`
  mutation CancelUltraplanFromGroup($id: ID!) {
    cancelUltraplan(id: $id) {
      id
    }
  }
`;

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

interface UltraplanStatusActionsProps {
  ultraplanId: string;
  status: string;
  canInteract: boolean;
}

export function UltraplanStatusActions({
  ultraplanId,
  status,
  canInteract,
}: UltraplanStatusActionsProps) {
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const terminal = TERMINAL_STATUSES.has(status);
  const canPause = canInteract && !terminal && status !== "paused";
  const canResume = canInteract && status === "paused";
  const canRunNow = canInteract && !terminal;
  const canCancel = canInteract && !terminal;

  async function runAction(label: string, mutation: typeof PAUSE_ULTRAPLAN_MUTATION) {
    setPendingAction(label);
    try {
      const result = await client.mutation(mutation, { id: ultraplanId }).toPromise();
      if (result.error) {
        toast.error(`Failed to ${label} Ultraplan`, { description: result.error.message });
      }
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="flex items-center gap-1">
      {canResume ? (
        <button
          type="button"
          onClick={() => void runAction("resume", RESUME_ULTRAPLAN_MUTATION)}
          disabled={pendingAction !== null}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-elevated hover:text-foreground disabled:opacity-40"
          title="Resume Ultraplan"
        >
          <Play size={13} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void runAction("pause", PAUSE_ULTRAPLAN_MUTATION)}
          disabled={!canPause || pendingAction !== null}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-elevated hover:text-foreground disabled:opacity-40"
          title="Pause Ultraplan"
        >
          <Pause size={13} />
        </button>
      )}
      <button
        type="button"
        onClick={() => void runAction("run", RUN_ULTRAPLAN_CONTROLLER_MUTATION)}
        disabled={!canRunNow || pendingAction !== null}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-elevated hover:text-foreground disabled:opacity-40"
        title="Run controller now"
      >
        <RotateCw size={13} />
      </button>
      <button
        type="button"
        onClick={() => void runAction("cancel", CANCEL_ULTRAPLAN_MUTATION)}
        disabled={!canCancel || pendingAction !== null}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-elevated hover:text-foreground disabled:opacity-40"
        title="Cancel Ultraplan"
      >
        <Square size={13} />
      </button>
    </div>
  );
}
