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
  showPanel?: boolean;
  createdAt: number;
}

interface TerminalState {
  terminals: Record<string, TerminalEntry>;
  pinnedTerminalIds: Record<string, boolean>;
  terminalCreationIntents: Record<string, TerminalCreationIntent>;
  addTerminal: (
    id: string,
    sessionId: string,
    sessionGroupId: string,
    status?: TerminalStatus,
    opts?: AddTerminalOptions,
  ) => void;
  setTerminalStatus: (id: string, status: TerminalStatus) => void;
  renameTerminal: (id: string, name: string) => void;
  claimInitialCommand: (
    id: string,
  ) => { command: string; submitInitialCommand: boolean } | null;
  pinTerminal: (id: string) => void;
  unpinTerminal: (id: string) => void;
  registerTerminalCreationIntent: (id: string, intent: TerminalCreationIntent) => void;
  cancelTerminalCreationIntent: (id: string) => void;
  consumeTerminalCreationIntent: (
    id: string,
    sessionId: string,
  ) => TerminalCreationIntent | null;
  removeTerminal: (id: string) => void;
}

type SetState<T> = (partial: Partial<T> | ((state: T) => Partial<T>)) => void;

export const useTerminalStore = create<TerminalState>((set: SetState<TerminalState>) => ({
  terminals: {},
  pinnedTerminalIds: {},
  terminalCreationIntents: {},

  addTerminal: (
    id: string,
    sessionId: string,
    sessionGroupId: string,
    status?: TerminalStatus,
    opts?: AddTerminalOptions,
  ) =>
    set((state: TerminalState) => {
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
            submitInitialCommand:
              opts?.submitInitialCommand ?? existing?.submitInitialCommand,
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
        Object.entries(state.terminalCreationIntents).filter(([, candidate]) =>
          candidate.createdAt >= cutoff,
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
      return { terminals: rest, pinnedTerminalIds: remainingPinnedIds };
    }),
}));

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
