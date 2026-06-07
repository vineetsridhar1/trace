export interface RunScript {
  name: string;
  command: string;
}

export function isRunScriptArray(value: unknown): value is RunScript[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item != null &&
        typeof item === "object" &&
        typeof (item as { name?: unknown }).name === "string" &&
        typeof (item as { command?: unknown }).command === "string",
    )
  );
}

export function buildRunScriptsCommand(scripts: RunScript[]): string {
  return scripts
    .map((script) => `printf '\\n\\033[1m${script.name.replaceAll("'", "'\\''")}\\033[0m\\n'\n${script.command}`)
    .join("\n");
}
