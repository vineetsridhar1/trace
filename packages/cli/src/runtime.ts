import { TraceClient } from "./client.js";
import { CliError, ExitCode, usage } from "./errors.js";

export type GlobalOptions = { json: boolean };

type BaseOption = {
  readonly name: string;
  readonly flag: `--${string}`;
  readonly description: string;
};

export type OptionDefinition =
  | (BaseOption & { readonly kind: "boolean" })
  | (BaseOption & {
      readonly kind: "string";
      readonly valueName: string;
      readonly choices?: readonly string[];
    })
  | (BaseOption & {
      readonly kind: "integer";
      readonly valueName: string;
      readonly min?: number;
      readonly max?: number;
    });

export type PositionalDefinition = {
  readonly name: string;
  readonly required?: boolean;
  readonly variadic?: boolean;
};

export type ParsedCommandInput = {
  readonly positionals: readonly string[];
  readonly options: Readonly<Record<string, string | number | boolean>>;
  readonly providedOptions: ReadonlySet<string>;
};

export type CommandContext = {
  readonly options: GlobalOptions;
  readonly env: NodeJS.ProcessEnv;
  output(value: unknown, human: string): void;
  client(requireOrganization?: boolean): Promise<TraceClient>;
};

export type CommandDefinition = {
  readonly path: readonly string[];
  readonly description: string;
  readonly options?: readonly OptionDefinition[];
  readonly positionals?: readonly PositionalDefinition[];
  run(ctx: CommandContext, input: ParsedCommandInput): Promise<void>;
};

export function defineCommand<const T extends CommandDefinition>(definition: T): T {
  return definition;
}

export function assertCommandDefinitions(commands: readonly CommandDefinition[]): void {
  const paths = new Set<string>();
  for (const command of commands) {
    const path = command.path.join(" ");
    if (!path || paths.has(path)) throw new Error(`Duplicate or empty command path: ${path}`);
    paths.add(path);

    const optionNames = new Set<string>();
    const optionFlags = new Set<string>();
    for (const option of command.options ?? []) {
      if (optionNames.has(option.name) || optionFlags.has(option.flag)) {
        throw new Error(`Duplicate option in command ${path}: ${option.flag}`);
      }
      optionNames.add(option.name);
      optionFlags.add(option.flag);
    }

    const positionals = command.positionals ?? [];
    const variadicIndex = positionals.findIndex((definition) => definition.variadic);
    if (variadicIndex !== -1 && variadicIndex !== positionals.length - 1) {
      throw new Error(`Variadic positional must be last for ${path}`);
    }
  }
}

export function parseGlobalOptions(argv: readonly string[]): {
  args: string[];
  options: GlobalOptions;
  help: boolean;
} {
  const args: string[] = [];
  const options: GlobalOptions = { json: false };
  let help = false;
  let optionsEnded = false;
  for (const value of argv) {
    if (value === "--") {
      optionsEnded = true;
      args.push(value);
    } else if (!optionsEnded && value === "--json") options.json = true;
    else if (!optionsEnded && (value === "--help" || value === "-h")) help = true;
    else args.push(value);
  }
  return { args, options, help };
}

export function findCommand(
  commands: readonly CommandDefinition[],
  args: readonly string[],
): CommandDefinition | undefined {
  return commands
    .filter((candidate) => candidate.path.every((part, index) => args[index] === part))
    .sort((left, right) => right.path.length - left.path.length)[0];
}

function parseOptionValue(definition: OptionDefinition, raw: string): string | number | boolean {
  if (definition.kind === "boolean") return true;
  if (definition.kind === "string") {
    if (definition.choices && !definition.choices.includes(raw)) {
      usage(`${definition.flag} must be one of: ${definition.choices.join(", ")}`);
    }
    return raw;
  }
  const value = Number(raw);
  if (!Number.isInteger(value)) usage(`${definition.flag} requires an integer`);
  if (definition.min !== undefined && value < definition.min) {
    usage(`${definition.flag} must be at least ${definition.min}`);
  }
  if (definition.max !== undefined && value > definition.max) {
    usage(`${definition.flag} must be at most ${definition.max}`);
  }
  return value;
}

export function parseCommandInput(
  command: CommandDefinition,
  args: readonly string[],
): ParsedCommandInput {
  const definitions = new Map((command.options ?? []).map((option) => [option.flag, option]));
  const options: Record<string, string | number | boolean> = {};
  const providedOptions = new Set<string>();
  const positionals: string[] = [];
  let optionsEnded = false;

  for (let index = command.path.length; index < args.length; index += 1) {
    const raw = args[index] ?? "";
    if (!optionsEnded && raw === "--") {
      optionsEnded = true;
      continue;
    }
    if (optionsEnded) {
      positionals.push(raw);
      continue;
    }
    const equals = raw.indexOf("=");
    const flag = (equals === -1 ? raw : raw.slice(0, equals)) as `--${string}`;
    const definition = definitions.get(flag);
    if (!definition) {
      if (raw.startsWith("--")) usage(`Unknown option: ${flag}`);
      positionals.push(raw);
      continue;
    }
    if (providedOptions.has(definition.name)) usage(`${definition.flag} may only be provided once`);
    providedOptions.add(definition.name);
    if (definition.kind === "boolean") {
      if (equals !== -1) usage(`${definition.flag} does not accept a value`);
      options[definition.name] = true;
      continue;
    }
    const value = equals === -1 ? args[++index] : raw.slice(equals + 1);
    if (!value) usage(`${definition.flag} requires ${definition.valueName}`);
    options[definition.name] = parseOptionValue(definition, value);
  }

  const positionalDefinitions = command.positionals ?? [];
  const variadicIndex = positionalDefinitions.findIndex((definition) => definition.variadic);
  const minimum = positionalDefinitions.filter((definition) => definition.required).length;
  if (positionals.length < minimum) {
    const missing = positionalDefinitions.find(
      (definition, index) => definition.required && index >= positionals.length,
    );
    usage(`${missing?.name ?? "Argument"} is required`);
  }
  if (variadicIndex === -1 && positionals.length > positionalDefinitions.length) {
    usage(`Unexpected argument: ${positionals[positionalDefinitions.length]}`);
  }

  return { positionals, options, providedOptions };
}

export function optionString(input: ParsedCommandInput, name: string): string | undefined {
  const value = input.options[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`Option ${name} is not a string`);
  return value;
}

export function optionInteger(input: ParsedCommandInput, name: string): number | undefined {
  const value = input.options[name];
  if (value === undefined) return undefined;
  if (typeof value !== "number") throw new Error(`Option ${name} is not a number`);
  return value;
}

export function optionBoolean(input: ParsedCommandInput, name: string): boolean {
  return input.options[name] === true;
}

export function commandUsage(command: CommandDefinition): string {
  const positionals = (command.positionals ?? []).map((definition) => {
    const value = definition.variadic ? `${definition.name}...` : definition.name;
    return definition.required ? `<${value}>` : `[${value}]`;
  });
  const options = (command.options ?? []).map((definition) =>
    definition.kind === "boolean"
      ? `[${definition.flag}]`
      : `[${definition.flag} ${definition.valueName}]`,
  );
  return ["trace", ...command.path, ...positionals, ...options, "[--json]"].join(" ");
}

export function commandHelp(command: CommandDefinition): string {
  const options = command.options ?? [];
  return [
    `Usage: ${commandUsage(command)}`,
    "",
    command.description,
    ...(options.length
      ? [
          "",
          "Options:",
          ...options.map((definition) => {
            const label =
              definition.kind === "boolean"
                ? definition.flag
                : `${definition.flag} ${definition.valueName}`;
            return `  ${label.padEnd(30)} ${definition.description}`;
          }),
        ]
      : []),
  ].join("\n");
}

export function commandDescriptor(command: CommandDefinition) {
  return {
    path: command.path,
    description: command.description,
    usage: commandUsage(command),
    positionals: command.positionals ?? [],
    options: command.options ?? [],
  };
}

export function createCommandContext(
  options: GlobalOptions,
  env: NodeJS.ProcessEnv = process.env,
): CommandContext {
  return {
    options,
    env,
    output(value, human) {
      process.stdout.write(options.json ? `${JSON.stringify(value)}\n` : `${human}\n`);
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
