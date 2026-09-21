import { execFileSync } from "child_process";

type ExecFileSyncFn = (
  file: string,
  args: string[],
  options: { encoding: BufferEncoding; timeout: number; env: NodeJS.ProcessEnv },
) => string;

const FALLBACK_PATHS = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"];
const LOGIN_SHELL_TIMEOUT_MS = 10_000;
const PATH_MARKER = "__TRACE_LOGIN_SHELL_PATH__=";

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
    const stdout = execFileSyncFn(shell, ["-lic", `printf "\\n${PATH_MARKER}%s\\n" "$PATH"`], {
      encoding: "utf8",
      timeout: LOGIN_SHELL_TIMEOUT_MS,
      env: { ...env },
    });
    const markedLine = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.startsWith(PATH_MARKER));
    if (!markedLine) {
      console.warn("[shell-path] login shell did not return its PATH");
      return null;
    }
    return markedLine.slice(PATH_MARKER.length) || null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[shell-path] failed to load login-shell PATH: ${message}`);
    return null;
  }
}

export function hydrateLoginShellPath(
  env: NodeJS.ProcessEnv = process.env,
  execFileSyncFn: ExecFileSyncFn = execFileSync,
): boolean {
  if (!env.SHELL?.trim() && process.platform !== "win32") {
    env.SHELL = "/bin/zsh";
  }

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
