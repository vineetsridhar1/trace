import { useCallback } from "react";
import { client } from "../../lib/urql";
import { SESSION_TERMINALS_QUERY } from "@trace/client-core";
import { terminalSessionScopeKey, useTerminalStore } from "../../stores/terminal";
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
  const markTerminalsRestored = useTerminalStore((s) => s.markTerminalsRestored);
  const clearTerminalsRestored = useTerminalStore((s) => s.clearTerminalsRestored);

  const ensureSessionTerminals = useCallback(
    async (sessionId: string) => {
      const existing = terminals.filter((t) => t.sessionId === sessionId);
      if (existing.length > 0) return existing;

      const scopeKey = terminalSessionScopeKey(sessionId);
      markTerminalsRestored(scopeKey);
      const result = await client.query(SESSION_TERMINALS_QUERY, { sessionId }).toPromise();
      if (result.error) {
        // Leave the scope unclaimed so the next open can look again rather
        // than spawning a duplicate of a terminal this session already has.
        clearTerminalsRestored(scopeKey);
        return [];
      }
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
    [addTerminal, clearTerminalsRestored, markTerminalsRestored, sessionGroupId, terminals],
  );

  const handleOpenTerminal = useCallback(
    async (session: { id: string; _optimistic?: boolean } | null, terminalAllowed: boolean) => {
      if (!session || session._optimistic || !terminalAllowed) return;

      // On the first open for a session, restore terminals that already exist
      // on the server instead of spawning a duplicate. After that every open
      // request creates a new terminal — an empty local list means the user
      // closed the terminals they had, not that none have been loaded yet.
      const alreadyRestored =
        useTerminalStore.getState().restoredScopeKeys[terminalSessionScopeKey(session.id)] === true;
      if (!alreadyRestored) {
        const existing = await ensureSessionTerminals(session.id);
        if (existing.length > 0) {
          setActiveSessionId(session.id);
          setActiveTerminalId(existing[0].id);
          return;
        }
      }

      setActiveSessionId(session.id);
      await requestSessionTerminal({ sessionId: session.id, select: true }).completion;
    },
    [ensureSessionTerminals, setActiveSessionId, setActiveTerminalId],
  );

  const handleCreateTerminal = useCallback(
    async (
      session: { id: string; _optimistic?: boolean } | null,
      terminalAllowed: boolean,
      options?: { replaceWorkspaceTabId?: string },
    ) => {
      if (!session || session._optimistic || !terminalAllowed) return;
      await requestSessionTerminal({
        sessionId: session.id,
        select: true,
        replaceWorkspaceTabId: options?.replaceWorkspaceTabId,
      }).completion;
    },
    [],
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
