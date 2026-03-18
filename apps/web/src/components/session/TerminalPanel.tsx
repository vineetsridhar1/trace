import { useCallback, useEffect, useRef } from "react";
import { Plus, X, TerminalSquare } from "lucide-react";
import { useTerminalStore, useSessionTerminals } from "../../stores/terminal";
import { TerminalInstance } from "./TerminalInstance";
import { client } from "../../lib/urql";
import { SESSION_TERMINALS_QUERY, CREATE_TERMINAL_MUTATION, DESTROY_TERMINAL_MUTATION } from "../../lib/mutations";
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
    if (result.error) {
      console.error("[terminal] failed to create terminal:", result.error.message);
      return;
    }
    if (result.data?.createTerminal) {
      // Terminal state is ephemeral (not event-sourced), so we read the mutation
      // result directly rather than waiting for an event stream update.
      const { id } = result.data.createTerminal as { id: string };
      addTerminal(id, sessionId);
    }
  }, [sessionId, addTerminal]);

  const destroyTerminal = useCallback(
    async (terminalId: string) => {
      removeTerminal(terminalId);
      const result = await client.mutation(DESTROY_TERMINAL_MUTATION, { terminalId }).toPromise();
      if (result.error) {
        console.error("[terminal] failed to destroy terminal:", result.error.message);
      }
    },
    [removeTerminal],
  );

  // On mount: query for existing terminals, restore them, or create a new one
  const hasTriggeredInit = useRef(false);
  useEffect(() => {
    if (hasTriggeredInit.current) return;
    hasTriggeredInit.current = true;

    (async () => {
      const result = await client
        .query(SESSION_TERMINALS_QUERY, { sessionId })
        .toPromise();

      const existing = result.data?.sessionTerminals as Array<{ id: string; sessionId: string }> | undefined;
      if (existing && existing.length > 0) {
        for (const t of existing) {
          // Only add if not already in store (idempotent)
          if (!useTerminalStore.getState().terminals[t.id]) {
            addTerminal(t.id, t.sessionId, "active");
          }
        }
      } else {
        createNewTerminal();
      }
    })();
  }, [sessionId, addTerminal, createNewTerminal]);

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
