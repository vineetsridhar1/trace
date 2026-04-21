import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

export type TerminalStatus = "connecting" | "active" | "exited";

export interface TerminalEntry {
  id: string;
  /** Set for session-scoped terminals. */
  sessionId: string | null;
  /** Set for session-scoped terminals whose session belongs to a group. */
  sessionGroupId: string | null;
  /** Set for channel-scoped terminals running on a bridge's main worktree. */
  channelId: string | null;
  /** Runtime the PTY lives on (set for both scopes, used to label the tab). */
  bridgeRuntimeId: string | null;
  status: TerminalStatus;
  customName?: string;
  initialCommand?: string;
}

interface AddTerminalInput {
  id: string;
  sessionId?: string | null;
  sessionGroupId?: string | null;
  channelId?: string | null;
  bridgeRuntimeId?: string | null;
  status?: TerminalStatus;
  customName?: string;
  initialCommand?: string;
}

interface TerminalState {
  terminals: Record<string, TerminalEntry>;
  addTerminal: (input: AddTerminalInput) => void;
  setTerminalStatus: (id: string, status: TerminalStatus) => void;
  renameTerminal: (id: string, name: string) => void;
  removeTerminal: (id: string) => void;
}

type SetState<T> = (partial: Partial<T> | ((state: T) => Partial<T>)) => void;

export const useTerminalStore = create<TerminalState>((set: SetState<TerminalState>) => ({
  terminals: {},

  addTerminal: (input: AddTerminalInput) =>
    set((state: TerminalState) => ({
      terminals: {
        ...state.terminals,
        [input.id]: {
          id: input.id,
          sessionId: input.sessionId ?? null,
          sessionGroupId: input.sessionGroupId ?? null,
          channelId: input.channelId ?? null,
          bridgeRuntimeId: input.bridgeRuntimeId ?? null,
          status: input.status ?? "connecting",
          customName: input.customName,
          initialCommand: input.initialCommand,
        },
      },
    })),

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

  removeTerminal: (id: string) =>
    set((state: TerminalState) => {
      const { [id]: _, ...rest } = state.terminals;
      return { terminals: rest };
    }),
}));

export function useSessionGroupTerminals(sessionGroupId: string): TerminalEntry[] {
  return useTerminalStore(
    useShallow((state: TerminalState) =>
      Object.values(state.terminals).filter(
        (terminal: TerminalEntry) => terminal.sessionGroupId === sessionGroupId,
      ),
    ),
  );
}

export function useChannelTerminals(channelId: string): TerminalEntry[] {
  return useTerminalStore(
    useShallow((state: TerminalState) =>
      Object.values(state.terminals).filter(
        (terminal: TerminalEntry) => terminal.channelId === channelId,
      ),
    ),
  );
}
