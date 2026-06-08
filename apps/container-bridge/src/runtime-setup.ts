import { spawn } from "child_process";

export function parseRuntimeSetupCommands(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  const trimmed = value.trim();

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((item): item is string => typeof item === "string")) {
      throw new Error("TRACE_RUNTIME_SETUP_COMMANDS must be a JSON array of strings");
    }
    return parsed.map((command) => command.trim()).filter(Boolean);
  }

  return trimmed
    .split(/\r?\n/)
    .map((command) => command.trim())
    .filter(Boolean);
}

export async function runRuntimeSetupCommands(commands: string[]): Promise<void> {
  for (const command of commands) {
    await runRuntimeSetupCommand(command);
  }
}

async function runRuntimeSetupCommand(command: string): Promise<void> {
  console.log(`[container-bridge] running launcher setup command: ${command}`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, {
      cwd: process.env.HOME ?? "/home/coder",
      env: process.env,
      shell: true,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (exitCode) => {
      if (exitCode === 0) {
        resolve();
        return;
      }
      reject(new Error(`Launcher setup command failed with exit code ${exitCode ?? 1}: ${command}`));
    });
  });
}
