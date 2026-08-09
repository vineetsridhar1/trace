import type { IntegrationConnection } from "@trace/gql";
import { describe, expect, it } from "vitest";
import { integrationConnectAvailability } from "./integration-connect-availability";

function connection(
  id: string,
  ownerUserId: string,
  kind: IntegrationConnection["kind"],
): IntegrationConnection {
  return {
    id,
    ownerUserId,
    provider: "github",
    providerConfigKey: "github-getting-started",
    displayName: id,
    kind,
    status: "active",
    lastError: null,
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
  };
}

describe("integrationConnectAvailability", () => {
  it("limits a user to one personal connection", () => {
    expect(
      integrationConnectAvailability([connection("mine", "user-1", "personal")], "user-1"),
    ).toEqual({ personalAvailable: false, serviceAvailable: true });
  });

  it("limits an organization to one service connection", () => {
    expect(
      integrationConnectAvailability([connection("service", "admin-2", "service")], "admin-1"),
    ).toEqual({ personalAvailable: true, serviceAvailable: false });
  });
});
