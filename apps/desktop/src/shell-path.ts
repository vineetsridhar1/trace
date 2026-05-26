import { execFileSync } from "child_process";

type ExecFileSyncFn = (
  file: string,
  args: string[],
  options: { encoding: BufferEncoding; timeout: number; env: NodeJS.ProcessEnv },
) => string;

const FALLBACK_PATHS = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"];

function splitPath(value: string | undefined): string[] {
  return (value ?? "")
    .split(":")
    .map((part) => part.trim())
    .filter(Boolean);
}

function mergePaths(...paths: string[]): string {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const pathValue of paths) {
    for (const entry of splitPath(pathValue)) {
      if (seen.has(entry)) continue;
      seen.add(entry);
      merged.push(entry);
    }
  }

  return merged.join(":");
}

function readLoginShellPath(
  env: NodeJS.ProcessEnv,
  execFileSyncFn: ExecFileSyncFn,
): string | null {
  if (process.platform === "win32") return null;

  const shell = env.SHELL?.trim() || "/bin/zsh";

  try {
    const stdout = execFileSyncFn(shell, ["-lic", 'printf "%s" "$PATH"'], {
      encoding: "utf8",
      timeout: 2_000,
      env: { ...env },
    });
    const lines = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.at(-1) ?? null;
  } catch {
    return null;
  }
}

export function hydrateLoginShellPath(
  env: NodeJS.ProcessEnv = process.env,
  execFileSyncFn: ExecFileSyncFn = execFileSync,
): boolean {
  const loginShellPath = readLoginShellPath(env, execFileSyncFn);
  const mergedPath = mergePaths(
    loginShellPath ?? "",
    env.PATH ?? "",
    FALLBACK_PATHS.join(":"),
  );

  if (!mergedPath || mergedPath === env.PATH) return false;
  env.PATH = mergedPath;
  return true;
}
