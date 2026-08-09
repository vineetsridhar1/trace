import type { IntegrationConnection } from "@trace/gql";

export function integrationConnectAvailability(
  connections: IntegrationConnection[],
  currentUserId: string | null,
) {
  return {
    personalAvailable:
      currentUserId !== null &&
      !connections.some(
        (connection) => connection.kind === "personal" && connection.ownerUserId === currentUserId,
      ),
    serviceAvailable: !connections.some((connection) => connection.kind === "service"),
  };
}
