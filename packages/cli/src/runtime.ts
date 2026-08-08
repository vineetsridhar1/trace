import { hostname } from "node:os";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { TraceClient } from "./client.js";
import { normalizeServerUrl, readConfig, readStoredCredential, type CliConfig } from "./config.js";
import { CliError, ExitCode, usage } from "./errors.js";

export type GlobalOptions = {
  json: boolean;
  server?: string;
  organizationId?: string;
};

export type CommandContext = {
  args: string[];
  options: GlobalOptions;
  config: CliConfig;
  env: NodeJS.ProcessEnv;
  output(value: unknown, human: string): void;
  client(requireOrganization?: boolean): Promise<TraceClient>;
};

export type Command = {
  path: readonly string[];
  usage: string;
  description: string;
  run(ctx: CommandContext): Promise<void>;
};

export function parseGlobalOptions(argv: string[]): { args: string[]; options: GlobalOptions } {
  const args: string[] = [];
  const options: GlobalOptions = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--json") options.json = true;
    else if (value === "--server")
      options.server = argv[++index] || usage("--server requires a URL");
    else if (value === "--org" || value === "--organization") {
      options.organizationId = argv[++index] || usage(`${value} requires an ID`);
    } else args.push(value ?? "");
  }
  return { args, options };
}

export function defaultDeviceName(): string {
  return `Trace CLI on ${hostname()}`;
}

export async function promptPairingCode(): Promise<string> {
  if (!stdin.isTTY) usage("Pairing code is required when stdin is not interactive");
  const readline = createInterface({ input: stdin, output: stdout });
  try {
    return (await readline.question("Pairing code: ")).trim();
  } finally {
    readline.close();
  }
}

export async function createCommandContext(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<CommandContext> {
  const parsed = parseGlobalOptions(argv);
  const config = await readConfig(env);
  const managedServerUrl = env.TRACE_SERVER_URL || env.TRACE_API_URL;
  if (managedServerUrl) config.serverUrl = normalizeServerUrl(managedServerUrl);
  if (parsed.options.server) config.serverUrl = normalizeServerUrl(parsed.options.server);
  if (parsed.options.organizationId) config.activeOrganizationId = parsed.options.organizationId;

  return {
    args: parsed.args,
    options: parsed.options,
    config,
    env,
    output(value, human) {
      process.stdout.write(parsed.options.json ? `${JSON.stringify(value)}\n` : `${human}\n`);
    },
    async client(requireOrganization = true) {
      const token =
        env.TRACE_INVOCATION_TOKEN || (await readStoredCredential(config.serverUrl, env));
      if (!token) {
        throw new CliError(
          "Not authenticated. Run `trace auth pair`.",
          ExitCode.authentication,
          "authentication",
        );
      }
      const organizationId =
        parsed.options.organizationId || env.TRACE_ORGANIZATION_ID || config.activeOrganizationId;
      if (requireOrganization && !organizationId) {
        usage("Organization is required; pass --org or pair the CLI first");
      }
      return new TraceClient(config.serverUrl, token, organizationId);
    },
  };
}
