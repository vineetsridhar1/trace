import type { Command } from "../runtime.js";
import type { MeResponse } from "./auth.js";

export const orgCommands: Command[] = [
  {
    path: ["org", "list"],
    usage: "trace org list [--json]",
    description: "List organizations available to the authenticated human",
    async run(ctx) {
      const client = await ctx.client(false);
      const result = await client.http<MeResponse>("/auth/me");
      const organizations = result.user.orgMemberships.map((membership) => ({
        id: membership.organization.id,
        name: membership.organization.name,
        role: membership.role,
        active: membership.organizationId === client.organizationId,
      }));
      ctx.output(
        { organizations },
        organizations.length
          ? organizations
              .map((org) => `${org.active ? "*" : " "} ${org.id}\t${org.name}\t${org.role}`)
              .join("\n")
          : "No organizations found",
      );
    },
  },
];
