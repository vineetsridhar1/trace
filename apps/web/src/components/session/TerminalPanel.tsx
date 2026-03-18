import { useCallback, useEffect, useRef } from "react";
import { Plus, X, TerminalSquare } from "lucide-react";
import { useTerminalStore, useSessionTerminals } from "../../stores/terminal";
import { TerminalInstance } from "./TerminalInstance";
import { client } from "../../lib/urql";
import { CREATE_TERMINAL_MUTATION, DESTROY_TERMINAL_MUTATION } from "../../lib/mutations";
import { cn } from "../../lib/utils";

export function TerminalPanel({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const terminals = useSessionTerminals(sessionId);
  const activeTerminalId = useTerminalStore((s) => s.activeTerminalId[sessionId]);
  const addTerminal = useTerminalStore((s) => s.addTerminal);
  const removeTerminal = useTerminalStore((s) => s.removeTerminal);
  const setActiveTerminal = useTerminalStore((s) => s.setActiveTerminal);

  const createNewTerminal = useCallback(async () => {
    const result = await client
      .mutation(CREATE_TERMINAL_MUTATION, { sessionId, cols: 80, rows: 24 })
      .toPromise();
    if (result.data?.createTerminal) {
      const { id } = result.data.createTerminal as { id: string };
      addTerminal(id, sessionId);
    }
  }, [sessionId, addTerminal]);

  const destroyTerminal = useCallback(
    async (terminalId: string) => {
      await client.mutation(DESTROY_TERMINAL_MUTATION, { terminalId }).toPromise();
      removeTerminal(terminalId);
    },
    [removeTerminal],
  );

  // Auto-create first terminal on mount
  const hasTriggeredCreate = useRef(false);
  useEffect(() => {
    if (!hasTriggeredCreate.current && terminals.length === 0) {
      hasTriggeredCreate.current = true;
      createNewTerminal();
    }
  }, [terminals.length, createNewTerminal]);

  return (
    <div className="flex flex-col border-t border-border bg-[#0a0a0a]" style={{ height: 300 }}>
      {/* Tab bar */}
      <div className="flex shrink-0 items-center gap-0.5 bg-surface-deep px-2 py-1 border-b border-border">
        <TerminalSquare size={14} className="mr-1.5 text-muted-foreground" />

        {terminals.map((t, i) => (
          <button
            key={t.id}
            onClick={() => setActiveTerminal(sessionId, t.id)}
            className={cn(
              "flex items-center gap-1.5 rounded px-2 py-0.5 text-xs transition-colors",
              activeTerminalId === t.id
                ? "bg-surface-elevated text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>Terminal {i + 1}</span>
            {t.status === "exited" && (
              <span className="text-[10px] text-muted-foreground">(exited)</span>
            )}
            <X
              size={12}
              className="opacity-50 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                destroyTerminal(t.id);
              }}
            />
          </button>
        ))}

        <button
          onClick={createNewTerminal}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors"
          title="New terminal"
        >
          <Plus size={12} />
        </button>

        <div className="flex-1" />

        <button
          onClick={onClose}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors"
          title="Close terminal panel"
        >
          <X size={14} />
        </button>
      </div>

      {/* Terminal content */}
      <div className="flex-1 overflow-hidden">
        {activeTerminalId && (
          <TerminalInstance key={activeTerminalId} terminalId={activeTerminalId} />
        )}
      </div>
    </div>
  );
}
