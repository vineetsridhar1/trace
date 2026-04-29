import { useEffect, useRef, useState } from "react";
import { Workflow } from "lucide-react";
import type { Session, Ultraplan } from "@trace/gql";
import { cn } from "../../lib/utils";
import { UltraplanPanel } from "./UltraplanPanel";

interface UltraplanHeaderControlProps {
  sessionGroupId: string;
  groupName?: string;
  groupBranch?: string | null;
  groupPrUrl?: string | null;
  ultraplan?: Ultraplan | null;
  controllerSession?: Pick<Session, "tool" | "model" | "hosting"> | null;
  runtimeInstanceId?: string | null;
  canInteract: boolean;
  onOpenSession: (sessionId: string) => void;
}

const statusLabel: Record<string, string> = {
  draft: "Draft",
  waiting: "Waiting",
  planning: "Planning",
  running: "Running",
  needs_human: "Needs human",
  integrating: "Integrating",
  paused: "Paused",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

const statusTone: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  waiting: "bg-muted text-muted-foreground",
  planning: "bg-blue-500/15 text-blue-300",
  running: "bg-emerald-500/15 text-emerald-300",
  needs_human: "bg-amber-500/15 text-amber-300",
  integrating: "bg-cyan-500/15 text-cyan-300",
  paused: "bg-zinc-500/20 text-zinc-300",
  completed: "bg-emerald-500/15 text-emerald-300",
  failed: "bg-red-500/15 text-red-300",
  cancelled: "bg-zinc-500/20 text-zinc-400",
};

export function UltraplanHeaderControl({
  sessionGroupId,
  groupName,
  groupBranch,
  groupPrUrl,
  ultraplan,
  controllerSession,
  runtimeInstanceId,
  canInteract,
  onOpenSession,
}: UltraplanHeaderControlProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const status = ultraplan?.status ?? "draft";

  useEffect(() => {
    if (!open) return;

    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-8 items-center gap-2 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
        title="Ultraplan"
      >
        <Workflow size={14} />
        <span
          className={cn(
            "hidden rounded px-1.5 py-0.5 text-[11px] font-medium sm:inline-flex",
            statusTone[status] ?? statusTone.draft,
          )}
        >
          {ultraplan ? (statusLabel[status] ?? status) : "Ultraplan"}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-[420px] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface shadow-lg">
          <UltraplanPanel
            sessionGroupId={sessionGroupId}
            groupName={groupName}
            groupBranch={groupBranch}
            groupPrUrl={groupPrUrl}
            ultraplan={ultraplan ?? null}
            controllerSession={controllerSession}
            runtimeInstanceId={runtimeInstanceId}
            canInteract={canInteract}
            onOpenSession={(sessionId) => {
              onOpenSession(sessionId);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
