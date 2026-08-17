import { useCallback, useEffect, useMemo, useRef } from "react";
import { TerminalSquare, X } from "lucide-react";
import { useEntityField } from "@trace/client-core";
import { SESSION_TERMINALS_QUERY } from "@trace/client-core";
import type { Terminal } from "@trace/gql";
import { client } from "../../lib/urql";
import { requestSessionTerminal } from "../../lib/terminal-creation";
import { useSessionGroupTerminals, useTerminalStore } from "../../stores/terminal";
import { cn } from "../../lib/utils";
import { TerminalInstance } from "./TerminalInstance";

export function TerminalPanel({
  sessionId,
  onClose,
  fill = false,
}: {
  sessionId: string;
  onClose: () => void;
  fill?: boolean;
}) {
  const sessionGroupId = useEntityField("sessions", sessionId, "sessionGroupId") as
    | string
    | undefined;
  const addTerminal = useTerminalStore((state) => state.addTerminal);
  const groupTerminals = useSessionGroupTerminals(sessionGroupId ?? "");
  const terminals = useMemo(
    () => groupTerminals.filter((terminal) => terminal.sessionId === sessionId),
    [groupTerminals, sessionId],
  );
  const terminal = terminals[0] ?? null;
  const initializedRef = useRef(false);

  const createTerminal = useCallback(async () => {
    try {
      await requestSessionTerminal({ sessionId }).completion;
    } catch (error) {
      console.error(
        "[terminal] failed to create terminal:",
        error instanceof Error ? error.message : error,
      );
    }
  }, [sessionId]);

  useEffect(() => {
    if (initializedRef.current || !sessionGroupId) return;
    initializedRef.current = true;

    void (async () => {
      const result = await client.query(SESSION_TERMINALS_QUERY, { sessionId }).toPromise();
      if (result.error) {
        console.warn("[terminal] failed to query existing terminals:", result.error.message);
      }

      const existing = (result.data?.sessionTerminals as Terminal[] | undefined) ?? [];
      for (const candidate of existing) {
        if (!useTerminalStore.getState().terminals[candidate.id]) {
          addTerminal(candidate.id, candidate.sessionId, sessionGroupId, "active");
        }
      }
      if (existing.length === 0) await createTerminal();
    })();
  }, [addTerminal, createTerminal, sessionGroupId, sessionId]);

  return (
    <div
      className={cn(
        "flex flex-col bg-background",
        fill ? "h-full min-h-0" : "border-t border-border",
      )}
      style={fill ? undefined : { height: 300 }}
    >
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border bg-surface-deep px-2 text-xs text-muted-foreground">
        <TerminalSquare size={14} />
        <span className="min-w-0 flex-1 truncate">
          {terminal?.customName ?? "Terminal"}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="flex size-5 items-center justify-center rounded transition-colors hover:bg-surface-elevated hover:text-foreground"
          title="Close terminal panel"
          aria-label="Close terminal panel"
        >
          <X size={13} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {terminal ? (
          <TerminalInstance terminalId={terminal.id} visible />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Opening terminal…
          </div>
        )}
      </div>
    </div>
  );
}
