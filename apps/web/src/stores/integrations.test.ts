import type { Event } from "@trace/gql";
import { beforeEach, describe, expect, it } from "vitest";
import { reconcileIntegrationEvent, useIntegrationStore } from "./integrations";

function integrationEvent(eventType: Event["eventType"], payload: Record<string, unknown>): Event {
  return {
    id: `event-${eventType}`,
    eventType,
    scopeType: "session",
    scopeId: "app-1",
    payload,
    timestamp: "2026-08-09T00:00:00.000Z",
  } as unknown as Event;
}

describe("integration event reconciliation", () => {
  beforeEach(() => {
    const state = useIntegrationStore.getState();
    state.setConnections([]);
    state.setSupported([]);
    state.setBindings("app-1", []);
  });

  it("updates bindings only from the service event payload", () => {
    reconcileIntegrationEvent(
      integrationEvent("app_integration_binding_updated", {
        binding: {
          id: "binding-1",
          integrationId: "github",
          sessionGroupId: "app-1",
          label: "GitHub",
        },
      }),
    );
    expect(
      useIntegrationStore.getState().bindingsBySessionGroup["app-1"]?.["binding-1"],
    ).toMatchObject({ integrationId: "github" });

    reconcileIntegrationEvent(
      integrationEvent("app_integration_binding_updated", {
        bindingId: "binding-1",
        deleted: true,
      }),
    );
    expect(
      useIntegrationStore.getState().bindingsBySessionGroup["app-1"]?.["binding-1"],
    ).toBeUndefined();
  });

  it("reconciles connection webhook events", () => {
    reconcileIntegrationEvent(
      integrationEvent("integration_connection_created", {
        connection: { id: "connection-1", status: "active" },
      }),
    );
    expect(useIntegrationStore.getState().connections["connection-1"]).toMatchObject({
      status: "active",
    });

    reconcileIntegrationEvent(
      integrationEvent("integration_connection_deleted", { connectionId: "connection-1" }),
    );
    expect(useIntegrationStore.getState().connections["connection-1"]).toBeUndefined();
  });
});
