import { useCallback } from "react";
import { client } from "../../lib/urql";
import { SESSION_TERMINALS_QUERY } from "@trace/client-core";
import { useTerminalStore } from "../../stores/terminal";
import { useUIStore } from "../../stores/ui";
import type { Terminal } from "@trace/gql";
import { requestSessionTerminal } from "../../lib/terminal-creation";

interface TerminalActionsArgs {
  sessionGroupId: string;
  terminals: Array<{ id: string; sessionId: string }>;
}

export function useTerminalActions({ sessionGroupId, terminals }: TerminalActionsArgs) {
  const setActiveSessionId = useUIStore((s) => s.setActiveSessionId);
  const setActiveTerminalId = useUIStore((s) => s.setActiveTerminalId);
  const addTerminal = useTerminalStore((s) => s.addTerminal);
  const pinTerminal = useTerminalStore((s) => s.pinTerminal);

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
        pinTerminal(existing[0].id);
        setActiveSessionId(session.id);
        setActiveTerminalId(existing[0].id);
        return;
      }

      setActiveSessionId(session.id);
      await requestSessionTerminal({ sessionId: session.id, pin: true, select: true }).completion;
    },
    [
      ensureSessionTerminals,
      pinTerminal,
      setActiveSessionId,
      setActiveTerminalId,
    ],
  );

  const handleCreateTerminal = useCallback(
    async (session: { id: string; _optimistic?: boolean } | null, terminalAllowed: boolean) => {
      if (!session || session._optimistic || !terminalAllowed) return;
      setActiveSessionId(session.id);
      await requestSessionTerminal({ sessionId: session.id, pin: true, select: true }).completion;
    },
    [setActiveSessionId],
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
    handleCreateTerminal,
    handleSelectTerminal,
  };
}
