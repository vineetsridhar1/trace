import { create } from "zustand";
import { useAuthStore } from "@trace/client-core";
import type {
  AppIntegrationBinding,
  Event,
  IntegrationConnection,
  SupportedAppIntegration,
} from "@trace/gql";

type IntegrationState = {
  connections: Record<string, IntegrationConnection>;
  supported: Record<string, SupportedAppIntegration>;
  bindingsBySessionGroup: Record<string, Record<string, AppIntegrationBinding>>;
  setConnections: (connections: IntegrationConnection[]) => void;
  setSupported: (integrations: SupportedAppIntegration[]) => void;
  upsertConnection: (connection: IntegrationConnection) => void;
  removeConnection: (id: string) => void;
  setBindings: (sessionGroupId: string, bindings: AppIntegrationBinding[]) => void;
  upsertBinding: (binding: AppIntegrationBinding) => void;
  removeBinding: (sessionGroupId: string, id: string) => void;
};

export const useIntegrationStore = create<IntegrationState>((set) => ({
  connections: {},
  supported: {},
  bindingsBySessionGroup: {},
  setConnections: (connections) =>
    set({
      connections: Object.fromEntries(connections.map((connection) => [connection.id, connection])),
    }),
  setSupported: (integrations) =>
    set({ supported: Object.fromEntries(integrations.map((item) => [item.id, item])) }),
  upsertConnection: (connection) =>
    set((state) => ({ connections: { ...state.connections, [connection.id]: connection } })),
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

function payloadObject(payload: Event["payload"]): Record<string, unknown> | null {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : null;
}

function entityObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function reconcileIntegrationEvent(event: Event): void {
  const payload = payloadObject(event.payload);
  if (!payload) return;
  const state = useIntegrationStore.getState();
  if (
    event.eventType === "integration_connection_created" ||
    event.eventType === "integration_connection_updated"
  ) {
    const connection = entityObject(payload.connection);
    if (connection && typeof connection.id === "string") {
      const auth = useAuthStore.getState();
      const role = auth.orgMemberships.find(
        (membership) => membership.organizationId === auth.activeOrgId,
      )?.role;
      if (auth.user && connection.ownerUserId !== auth.user.id) {
        if (role !== "admin" || connection.kind !== "service") return;
      }
      state.upsertConnection(connection as unknown as IntegrationConnection);
    }
    return;
  }
  if (event.eventType === "integration_connection_deleted") {
    if (typeof payload.connectionId === "string") state.removeConnection(payload.connectionId);
    return;
  }
  if (event.eventType !== "app_integration_binding_updated") return;
  if (payload.deleted === true && typeof payload.bindingId === "string") {
    state.removeBinding(event.scopeId, payload.bindingId);
    return;
  }
  const binding = entityObject(payload.binding);
  if (binding && typeof binding.id === "string" && typeof binding.sessionGroupId === "string") {
    state.upsertBinding(binding as unknown as AppIntegrationBinding);
  }
}
