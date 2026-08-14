export const ExitCode = {
  success: 0,
  authentication: 2,
  authorization: 3,
  validation: 4,
  connectivity: 5,
  server: 6,
  usage: 64,
} as const;

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
    readonly category: string,
  ) {
    super(message);
    this.name = "CliError";
  }
}

export function usage(message: string): never {
  throw new CliError(message, ExitCode.usage, "usage");
}
