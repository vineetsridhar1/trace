import type { Context } from "../context.js";

/**
 * Assert that the context has an active organization and return its ID.
 * Use this in resolvers for org-scoped operations.
 */
export function requireOrgContext(ctx: Context): string {
  if (!ctx.organizationId) {
    throw new Error("Organization context required");
  }
  return ctx.organizationId;
}
