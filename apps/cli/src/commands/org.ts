import type { Command } from "commander";
import { getConfigValue, resolveServerUrl, setConfigValue } from "../config.js";
import { ACTIVE_ORG_CONFIG_KEY, graphqlRequest } from "../http.js";

interface OrgMembership {
  role: string;
  organization: { id: string; name: string };
}

async function fetchOrganizations(serverUrl: string): Promise<OrgMembership[]> {
  const data = await graphqlRequest<{ myOrganizations: OrgMembership[] }>(
    serverUrl,
    "query { myOrganizations { role organization { id name } } }",
  );
  return data.myOrganizations;
}

export function registerOrgCommands(program: Command): void {
  const org = program.command("org").description("Manage the active organization");

  org
    .command("list")
    .description("List organizations you belong to")
    .action(async (_opts: unknown, cmd: Command) => {
      const globals = cmd.optsWithGlobals();
      const serverUrl = resolveServerUrl(globals.server as string | undefined);
      const memberships = await fetchOrganizations(serverUrl);
      const activeOrgId = getConfigValue(ACTIVE_ORG_CONFIG_KEY);
      if (globals.json) {
        console.log(
          JSON.stringify(
            memberships.map((m) => ({
              id: m.organization.id,
              name: m.organization.name,
              role: m.role,
              active: m.organization.id === activeOrgId,
            })),
          ),
        );
        return;
      }
      for (const m of memberships) {
        const marker = m.organization.id === activeOrgId ? "*" : " ";
        console.log(`${marker} ${m.organization.name} (${m.organization.id}) ${m.role}`);
      }
    });

  org
    .command("switch")
    .description("Set the active organization by name or ID")
    .argument("<name>", "organization name (case-insensitive) or ID")
    .action(async (name: string, _opts: unknown, cmd: Command) => {
      const serverUrl = resolveServerUrl(cmd.optsWithGlobals().server as string | undefined);
      const memberships = await fetchOrganizations(serverUrl);
      const byId = memberships.find((m) => m.organization.id === name);
      const byName = memberships.filter(
        (m) => m.organization.name.toLowerCase() === name.toLowerCase(),
      );
      if (!byId && byName.length > 1) {
        throw new Error(
          `Organization name "${name}" is ambiguous. Use an ID: ${byName
            .map((m) => m.organization.id)
            .join(", ")}`,
        );
      }
      const match = byId ?? byName[0];
      if (!match) {
        throw new Error(`No organization named "${name}". Run \`trace org list\`.`);
      }
      setConfigValue(ACTIVE_ORG_CONFIG_KEY, match.organization.id);
      console.log(`Active org: ${match.organization.name} (${match.organization.id})`);
    });
}
