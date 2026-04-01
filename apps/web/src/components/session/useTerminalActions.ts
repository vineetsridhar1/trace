import { useCallback } from "react";
import { client } from "../../lib/urql";
import {
  CREATE_TERMINAL_MUTATION,
  DESTROY_TERMINAL_MUTATION,
  SESSION_TERMINALS_QUERY,
} from "../../lib/mutations";
import { useTerminalStore } from "../../stores/terminal";
import { useUIStore } from "../../stores/ui";
import type { Terminal } from "@trace/gql";

interface TerminalActionsArgs {
  sessionGroupId: string;
  terminals: Array<{ id: string; sessionId: string }>;
}

export function useTerminalActions({ sessionGroupId, terminals }: TerminalActionsArgs) {
  const activeTerminalId = useUIStore((s) => s.activeTerminalId);
  const setActiveSessionId = useUIStore((s) => s.setActiveSessionId);
  const setActiveTerminalId = useUIStore((s) => s.setActiveTerminalId);
  const addTerminal = useTerminalStore((s) => s.addTerminal);
  const removeTerminal = useTerminalStore((s) => s.removeTerminal);

  const ensureSessionTerminals = useCallback(
    async (sessionId: string) => {
      const existing = terminals.filter((t) => t.sessionId === sessionId);
      if (existing.length > 0) return existing;

      const result = await client.query(SESSION_TERMINALS_QUERY, { sessionId }).toPromise();
      const restored = (result.data?.sessionTerminals as Terminal[] | undefined) ?? [];
      for (const t of restored) {
        if (!useTerminalStore.getState().terminals[t.id]) {
          addTerminal(t.id, t.sessionId, sessionGroupId, "active");
        }
      }
      return restored.map((t) => ({
        id: t.id,
        sessionId: t.sessionId,
        sessionGroupId,
        status: "active" as const,
      }));
    },
    [addTerminal, sessionGroupId, terminals],
  );

  const handleOpenTerminal = useCallback(
    async (session: { id: string; _optimistic?: boolean } | null, terminalAllowed: boolean) => {
      if (!session || session._optimistic || !terminalAllowed) return;
      const existing = await ensureSessionTerminals(session.id);
      if (existing.length > 0) {
        setActiveSessionId(session.id);
        setActiveTerminalId(existing[0].id);
        return;
      }

      const result = await client
        .mutation(CREATE_TERMINAL_MUTATION, { sessionId: session.id, cols: 80, rows: 24 })
        .toPromise();
      if (result.data?.createTerminal) {
        const { id } = result.data.createTerminal as { id: string };
        addTerminal(id, session.id, sessionGroupId);
        setActiveSessionId(session.id);
        setActiveTerminalId(id);
      }
    },
    [addTerminal, ensureSessionTerminals, sessionGroupId, setActiveSessionId, setActiveTerminalId],
  );

  const handleCloseTerminal = useCallback(
    async (terminalId: string) => {
      removeTerminal(terminalId);
      if (activeTerminalId === terminalId) {
        setActiveTerminalId(null);
      }
      await client.mutation(DESTROY_TERMINAL_MUTATION, { terminalId }).toPromise();
    },
    [activeTerminalId, removeTerminal, setActiveTerminalId],
  );

  const handleSelectTerminal = useCallback(
    (sessionId: string | null, terminalId: string) => {
      if (sessionId) setActiveSessionId(sessionId);
      setActiveTerminalId(terminalId);
    },
    [setActiveSessionId, setActiveTerminalId],
  );

  return {
    handleOpenTerminal,
    handleCloseTerminal,
    handleSelectTerminal,
  };
}
