import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, X, TerminalSquare } from "lucide-react";
import { useSessionGroupTerminals, useTerminalStore } from "../../stores/terminal";
import { useEntityField } from "../../stores/entity";
import { TerminalInstance } from "./TerminalInstance";
import { client } from "../../lib/urql";
import {
  SESSION_TERMINALS_QUERY,
  CREATE_TERMINAL_MUTATION,
  DESTROY_TERMINAL_MUTATION,
} from "../../lib/mutations";
import { cn } from "../../lib/utils";
import type { Terminal } from "@trace/gql";

export function TerminalPanel({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const sessionGroupId = useEntityField("sessions", sessionId, "sessionGroupId") as string | undefined;
  const addTerminal = useTerminalStore((s) => s.addTerminal);
  const removeTerminal = useTerminalStore((s) => s.removeTerminal);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const groupTerminals = useSessionGroupTerminals(sessionGroupId ?? "");

  const terminals = useMemo(
    () => (sessionGroupId ? groupTerminals : []),
    [groupTerminals, sessionGroupId],
  );

  useEffect(() => {
    if (!activeTerminalId || terminals.some((terminal) => terminal.id === activeTerminalId)) return;
    setActiveTerminalId(terminals[0]?.id ?? null);
  }, [activeTerminalId, terminals]);

  const createNewTerminal = useCallback(async () => {
    if (!sessionGroupId) return;
    const result = await client
      .mutation(CREATE_TERMINAL_MUTATION, { sessionId, cols: 80, rows: 24 })
      .toPromise();
    if (result.error) {
      console.error("[terminal] failed to create terminal:", result.error.message);
      return;
    }
    if (result.data?.createTerminal) {
      const { id } = result.data.createTerminal as { id: string };
      addTerminal(id, sessionId, sessionGroupId);
      setActiveTerminalId(id);
    }
  }, [addTerminal, sessionGroupId, sessionId]);

  const destroyTerminal = useCallback(
    async (terminalId: string) => {
      removeTerminal(terminalId);
      if (activeTerminalId === terminalId) {
        const nextTerminal = terminals.find((terminal) => terminal.id !== terminalId);
        setActiveTerminalId(nextTerminal?.id ?? null);
      }
      const result = await client.mutation(DESTROY_TERMINAL_MUTATION, { terminalId }).toPromise();
      if (result.error) {
        console.error("[terminal] failed to destroy terminal:", result.error.message);
      }
    },
    [activeTerminalId, removeTerminal, terminals],
  );

  const hasTriggeredInit = useRef(false);
  useEffect(() => {
    if (hasTriggeredInit.current || !sessionGroupId) return;
    hasTriggeredInit.current = true;

    (async () => {
      const result = await client.query(SESSION_TERMINALS_QUERY, { sessionId }).toPromise();

      if (result.error) {
        console.warn("[terminal] failed to query existing terminals:", result.error.message);
      }

      const existing = result.data?.sessionTerminals as Terminal[] | undefined;
      if (existing && existing.length > 0) {
        for (const terminal of existing) {
          if (!useTerminalStore.getState().terminals[terminal.id]) {
            addTerminal(terminal.id, terminal.sessionId, sessionGroupId, "active");
          }
        }
        setActiveTerminalId(existing[0]?.id ?? null);
        return;
      }

      createNewTerminal();
    })();
  }, [addTerminal, createNewTerminal, sessionGroupId, sessionId]);

  return (
    <div className="flex flex-col border-t border-border bg-[#0a0a0a]" style={{ height: 300 }}>
      <div className="flex shrink-0 items-center gap-0.5 border-b border-border bg-surface-deep px-2 py-1">
        <TerminalSquare size={14} className="mr-1.5 text-muted-foreground" />

        {terminals.map((terminal, index) => (
          <button
            key={terminal.id}
            onClick={() => setActiveTerminalId(terminal.id)}
            className={cn(
              "flex items-center gap-1.5 rounded px-2 py-0.5 text-xs transition-colors",
              activeTerminalId === terminal.id
                ? "bg-surface-elevated text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>Terminal {index + 1}</span>
            {terminal.status === "exited" && (
              <span className="text-[10px] text-muted-foreground">(exited)</span>
            )}
            <X
              size={12}
              className="opacity-50 hover:opacity-100"
              onClick={(event) => {
                event.stopPropagation();
                destroyTerminal(terminal.id);
              }}
            />
          </button>
        ))}

        <button
          onClick={createNewTerminal}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
          title="New terminal"
        >
          <Plus size={12} />
        </button>

        <div className="flex-1" />

        <button
          onClick={onClose}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
          title="Close terminal panel"
        >
          <X size={14} />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {terminals.map((terminal) => (
          <div
            key={terminal.id}
            className={cn("absolute inset-0", activeTerminalId === terminal.id ? "visible" : "invisible")}
          >
            <TerminalInstance
              terminalId={terminal.id}
              visible={activeTerminalId === terminal.id}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
