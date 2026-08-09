import { TraceClient } from "./client.js";
import { CliError, ExitCode, usage } from "./errors.js";

export type GlobalOptions = {
  json: boolean;
};

export type CommandContext = {
  args: string[];
  options: GlobalOptions;
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
    else args.push(value ?? "");
  }
  return { args, options };
}

export async function createCommandContext(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<CommandContext> {
  const parsed = parseGlobalOptions(argv);

  return {
    args: parsed.args,
    options: parsed.options,
    env,
    output(value, human) {
      process.stdout.write(parsed.options.json ? `${JSON.stringify(value)}\n` : `${human}\n`);
    },
    async client(requireOrganization = true) {
      const token = env.TRACE_INVOCATION_TOKEN;
      if (!token) {
        throw new CliError(
          "This command is only available inside an active Trace AI session",
          ExitCode.authentication,
          "authentication",
        );
      }
      // The bridge resolves its WebSocket server URL into an HTTP(S) API URL.
      // Prefer that reachable runtime-specific value over the service fallback,
      // which may point at localhost from inside a cloud container.
      const serverUrl = env.TRACE_API_URL || env.TRACE_SERVER_URL;
      if (!serverUrl) {
        throw new CliError(
          "The Trace server URL is unavailable in this session",
          ExitCode.authentication,
          "authentication",
        );
      }
      const organizationId = env.TRACE_ORGANIZATION_ID;
      if (requireOrganization && !organizationId) {
        throw new CliError(
          "The Trace organization is unavailable in this session",
          ExitCode.authentication,
          "authentication",
        );
      }
      return new TraceClient(serverUrl, token, organizationId);
    },
  };
}
