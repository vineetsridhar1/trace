import { AuthorizationError } from "./errors.js";

/**
 * Gate for every GraphQL operation: the authenticated user must belong to an
 * organization. Enforced at context construction so unauthorized requests never
 * reach a resolver. This server is single-tenant, so org membership is
 * effectively "is this user allowed on this server".
 */
export function assertOrgMembership(organizationId: string | null): void {
  if (!organizationId) {
    throw new AuthorizationError("Organization membership required");
  }
}
