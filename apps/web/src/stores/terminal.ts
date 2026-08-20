import { useMemo } from "react";
import { create } from "zustand";

export type TerminalStatus = "connecting" | "active" | "exited";

export interface TerminalEntry {
  id: string;
  sessionId: string;
  sessionGroupId: string;
  status: TerminalStatus;
  customName?: string;
  initialCommand?: string;
  submitInitialCommand?: boolean;
  initialCommandSent?: boolean;
  creationIntentId?: string;
}

export interface AddTerminalOptions {
  customName?: string;
  initialCommand?: string;
  submitInitialCommand?: boolean;
  creationIntentId?: string;
}

export interface TerminalCreationIntent extends AddTerminalOptions {
  sessionId: string;
  replaceWorkspaceTabId?: string;
  pin?: boolean;
  select?: boolean;
  createdAt: number;
}

/**
 * How many destroyed terminal ids to remember. Terminal ids are unique per
 * creation, so this only has to outlive the queries and events still in flight
 * for a terminal the user just closed.
 */
const MAX_CLOSED_TERMINAL_IDS = 200;

interface TerminalState {
  terminals: Record<string, TerminalEntry>;
  pinnedTerminalIds: Record<string, boolean>;
  terminalCreationIntents: Record<string, TerminalCreationIntent>;
  /** Terminals closed in this tab. Guards against a stale list re-adding them. */
  closedTerminalIds: Record<string, boolean>;
  /**
   * Scopes whose pre-existing terminals were already loaded from the server.
   * An empty terminal list is not the same as "not loaded yet" — closing every
   * terminal also empties it, and re-querying then resurrects closed tabs.
   */
  restoredScopeKeys: Record<string, boolean>;
  markTerminalsRestored: (scopeKey: string) => void;
  clearTerminalsRestored: (scopeKey: string) => void;
  addTerminal: (
    id: string,
    sessionId: string,
    sessionGroupId: string,
    status?: TerminalStatus,
    opts?: AddTerminalOptions,
  ) => void;
  setTerminalStatus: (id: string, status: TerminalStatus) => void;
  renameTerminal: (id: string, name: string) => void;
  claimInitialCommand: (id: string) => { command: string; submitInitialCommand: boolean } | null;
  pinTerminal: (id: string) => void;
  unpinTerminal: (id: string) => void;
  registerTerminalCreationIntent: (id: string, intent: TerminalCreationIntent) => void;
  cancelTerminalCreationIntent: (id: string) => void;
  consumeTerminalCreationIntent: (id: string, sessionId: string) => TerminalCreationIntent | null;
  removeTerminal: (id: string) => void;
}

type SetState<T> = (partial: Partial<T> | ((state: T) => Partial<T>)) => void;

export const useTerminalStore = create<TerminalState>((set: SetState<TerminalState>) => ({
  terminals: {},
  pinnedTerminalIds: {},
  terminalCreationIntents: {},
  closedTerminalIds: {},
  restoredScopeKeys: {},

  markTerminalsRestored: (scopeKey: string) =>
    set((state: TerminalState) => {
      if (state.restoredScopeKeys[scopeKey]) return {};
      return { restoredScopeKeys: { ...state.restoredScopeKeys, [scopeKey]: true } };
    }),

  clearTerminalsRestored: (scopeKey: string) =>
    set((state: TerminalState) => {
      if (!state.restoredScopeKeys[scopeKey]) return {};
      const { [scopeKey]: _, ...rest } = state.restoredScopeKeys;
      return { restoredScopeKeys: rest };
    }),

  addTerminal: (
    id: string,
    sessionId: string,
    sessionGroupId: string,
    status?: TerminalStatus,
    opts?: AddTerminalOptions,
  ) =>
    set((state: TerminalState) => {
      if (state.closedTerminalIds[id]) return {};
      const existing = state.terminals[id];
      return {
        terminals: {
          ...state.terminals,
          [id]: {
            ...existing,
            id,
            sessionId,
            sessionGroupId,
            status: status ?? existing?.status ?? "connecting",
            customName: opts?.customName ?? existing?.customName,
            initialCommand: opts?.initialCommand ?? existing?.initialCommand,
            submitInitialCommand: opts?.submitInitialCommand ?? existing?.submitInitialCommand,
            initialCommandSent: existing?.initialCommandSent,
            creationIntentId: opts?.creationIntentId ?? existing?.creationIntentId,
          },
        },
      };
    }),

  setTerminalStatus: (id: string, status: TerminalStatus) =>
    set((state: TerminalState) => {
      const entry = state.terminals[id];
      if (!entry) return {};
      return { terminals: { ...state.terminals, [id]: { ...entry, status } } };
    }),

  renameTerminal: (id: string, name: string) =>
    set((state: TerminalState) => {
      const entry = state.terminals[id];
      if (!entry) return {};
      const customName = name.trim() || undefined;
      return { terminals: { ...state.terminals, [id]: { ...entry, customName } } };
    }),

  claimInitialCommand: (id: string) => {
    let claimed: { command: string; submitInitialCommand: boolean } | null = null;
    set((state: TerminalState) => {
      const entry = state.terminals[id];
      if (!entry?.initialCommand || entry.initialCommandSent) return {};
      claimed = {
        command: entry.initialCommand,
        submitInitialCommand: entry.submitInitialCommand !== false,
      };
      return {
        terminals: {
          ...state.terminals,
          [id]: { ...entry, initialCommandSent: true },
        },
      };
    });
    return claimed;
  },

  pinTerminal: (id: string) =>
    set((state: TerminalState) => {
      if (!state.terminals[id]) return {};
      return { pinnedTerminalIds: { ...state.pinnedTerminalIds, [id]: true } };
    }),

  unpinTerminal: (id: string) =>
    set((state: TerminalState) => {
      const { [id]: _, ...rest } = state.pinnedTerminalIds;
      return { pinnedTerminalIds: rest };
    }),

  registerTerminalCreationIntent: (id: string, intent: TerminalCreationIntent) =>
    set((state: TerminalState) => {
      const cutoff = Date.now() - 5 * 60 * 1000;
      const activeIntents = Object.fromEntries(
        Object.entries(state.terminalCreationIntents).filter(
          ([, candidate]) => candidate.createdAt >= cutoff,
        ),
      );
      return { terminalCreationIntents: { ...activeIntents, [id]: intent } };
    }),

  cancelTerminalCreationIntent: (id: string) =>
    set((state: TerminalState) => {
      const { [id]: _, ...rest } = state.terminalCreationIntents;
      return { terminalCreationIntents: rest };
    }),

  consumeTerminalCreationIntent: (id: string, sessionId: string) => {
    let consumed: TerminalCreationIntent | null = null;
    set((state: TerminalState) => {
      const intent = state.terminalCreationIntents[id];
      if (!intent || intent.sessionId !== sessionId) return {};
      consumed = intent;
      const { [id]: _, ...rest } = state.terminalCreationIntents;
      return { terminalCreationIntents: rest };
    });
    return consumed;
  },

  removeTerminal: (id: string) =>
    set((state: TerminalState) => {
      const { [id]: _, ...rest } = state.terminals;
      const { [id]: _pinned, ...remainingPinnedIds } = state.pinnedTerminalIds;
      return {
        terminals: rest,
        pinnedTerminalIds: remainingPinnedIds,
        closedTerminalIds: rememberClosedTerminalId(state.closedTerminalIds, id),
      };
    }),
}));

function rememberClosedTerminalId(
  closedTerminalIds: Record<string, boolean>,
  id: string,
): Record<string, boolean> {
  if (closedTerminalIds[id]) return closedTerminalIds;
  const ids = [...Object.keys(closedTerminalIds), id].slice(-MAX_CLOSED_TERMINAL_IDS);
  return Object.fromEntries(ids.map((closedId) => [closedId, true]));
}

/** Scope key for a group's pre-existing terminals. */
export function terminalGroupScopeKey(sessionGroupId: string): string {
  return `group:${sessionGroupId}`;
}

/** Scope key for a single session's pre-existing terminals. */
export function terminalSessionScopeKey(sessionId: string): string {
  return `session:${sessionId}`;
}

export function useSessionGroupTerminals(sessionGroupId: string): TerminalEntry[] {
  const terminals = useTerminalStore((state: TerminalState) => state.terminals);
  return useMemo(
    () =>
      Object.values(terminals).filter(
        (terminal: TerminalEntry) => terminal.sessionGroupId === sessionGroupId,
      ),
    [sessionGroupId, terminals],
  );
}
