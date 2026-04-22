import { create } from "zustand";

type SetState<T> = (
  partial: Partial<T> | ((state: T) => Partial<T>),
) => void;

export interface ConnectionState {
  connected: boolean;
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

export const useConnectionStore = create<ConnectionState>(
  (set: SetState<ConnectionState>) => ({
    connected: false,
    reconnectCounter: 0,
    hasConnectedBefore: false,
    setConnected: (connected: boolean) =>
      set((state: ConnectionState) => {
        if (!connected) return { connected: false };
        if (!state.hasConnectedBefore) {
          return { connected: true, hasConnectedBefore: true };
        }
        if (!state.connected) {
          return {
            connected: true,
            reconnectCounter: state.reconnectCounter + 1,
          };
        }
        return { connected: true };
      }),
  }),
);
