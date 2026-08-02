import { create } from "zustand";
import type { AppIntegrationBinding, IntegrationConnection } from "@trace/gql";

type IntegrationState = {
  connections: Record<string, IntegrationConnection>;
  bindingsBySessionGroup: Record<string, Record<string, AppIntegrationBinding>>;
  setConnections: (connections: IntegrationConnection[]) => void;
  removeConnection: (id: string) => void;
  setBindings: (sessionGroupId: string, bindings: AppIntegrationBinding[]) => void;
  upsertBinding: (binding: AppIntegrationBinding) => void;
  removeBinding: (sessionGroupId: string, id: string) => void;
};

export const useIntegrationStore = create<IntegrationState>((set) => ({
  connections: {},
  bindingsBySessionGroup: {},
  setConnections: (connections) =>
    set({
      connections: Object.fromEntries(connections.map((connection) => [connection.id, connection])),
    }),
  removeConnection: (id) =>
    set((state) => {
      const connections = { ...state.connections };
      delete connections[id];
      return { connections };
    }),
  setBindings: (sessionGroupId, bindings) =>
    set((state) => ({
      bindingsBySessionGroup: {
        ...state.bindingsBySessionGroup,
        [sessionGroupId]: Object.fromEntries(bindings.map((binding) => [binding.id, binding])),
      },
    })),
  upsertBinding: (binding) =>
    set((state) => ({
      bindingsBySessionGroup: {
        ...state.bindingsBySessionGroup,
        [binding.sessionGroupId]: {
          ...state.bindingsBySessionGroup[binding.sessionGroupId],
          [binding.id]: binding,
        },
      },
    })),
  removeBinding: (sessionGroupId, id) =>
    set((state) => {
      const bindings = { ...state.bindingsBySessionGroup[sessionGroupId] };
      delete bindings[id];
      return {
        bindingsBySessionGroup: { ...state.bindingsBySessionGroup, [sessionGroupId]: bindings },
      };
    }),
}));
