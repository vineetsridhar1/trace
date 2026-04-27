import { create } from "zustand";

type SetState<T> = (partial: Partial<T> | ((state: T) => Partial<T>)) => void;

export interface ConnectionState {
  connected: boolean;
  disconnectedAt: number | null;
  /**
   * Increments on every disconnect→reconnect transition (not on initial connect).
   * Hooks depend on this to trigger a catch-up fetch after the WS recovers,
   * since the server's in-memory pubsub has no replay — events emitted while
   * the socket was down are lost to the client otherwise.
   */
  reconnectCounter: number;
  hasConnectedBefore: boolean;
  setConnected: (connected: boolean) => void;
}

export const useConnectionStore = create<ConnectionState>((set: SetState<ConnectionState>) => ({
  connected: false,
  disconnectedAt: null,
  reconnectCounter: 0,
  hasConnectedBefore: false,
  setConnected: (connected: boolean) =>
    set((state: ConnectionState) => {
      if (!connected) {
        return {
          connected: false,
          disconnectedAt: state.disconnectedAt ?? (state.hasConnectedBefore ? Date.now() : null),
        };
      }
      if (!state.hasConnectedBefore) {
        return {
          connected: true,
          disconnectedAt: null,
          hasConnectedBefore: true,
        };
      }
      if (!state.connected) {
        return {
          connected: true,
          disconnectedAt: null,
          reconnectCounter: state.reconnectCounter + 1,
        };
      }
      return { connected: true, disconnectedAt: null };
    }),
}));
