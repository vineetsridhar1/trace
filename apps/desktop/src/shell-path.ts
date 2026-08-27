import { execFile } from "child_process";

type ExecFileFn = (
  file: string,
  args: string[],
  options: { timeout: number; env: NodeJS.ProcessEnv },
) => Promise<string>;

const FALLBACK_PATHS = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
];
const LOGIN_SHELL_TIMEOUT_MS = 10_000;
const PATH_MARKER = "__TRACE_LOGIN_SHELL_PATH__=";

export type LoginShellPathResult = {
  loaded: boolean;
  error: string | null;
};

const execFileAsync: ExecFileFn = (file, args, options) =>
  new Promise((resolve, reject) => {
    execFile(file, args, { ...options, encoding: "utf8" }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });

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

async function readLoginShellPath(
  env: NodeJS.ProcessEnv,
  execFileFn: ExecFileFn,
): Promise<{ path: string | null; error: string | null }> {
  const shell = env.SHELL?.trim() || "/bin/zsh";

  try {
    const stdout = await execFileFn(shell, ["-lic", `printf "\\n${PATH_MARKER}%s\\n" "$PATH"`], {
      timeout: LOGIN_SHELL_TIMEOUT_MS,
      env: { ...env },
    });
    const markedLine = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.startsWith(PATH_MARKER));
    const loginShellPath = markedLine?.slice(PATH_MARKER.length) || null;
    return loginShellPath
      ? { path: loginShellPath, error: null }
      : { path: null, error: "The login shell did not return its PATH." };
  } catch (error) {
    return {
      path: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Merge the user's login-shell PATH into the desktop process environment.
 * Returns whether the login shell answered successfully. Fallback directories
 * are still applied when shell startup fails or times out.
 */
export async function hydrateLoginShellPath(
  env: NodeJS.ProcessEnv = process.env,
  execFileFn: ExecFileFn = execFileAsync,
): Promise<LoginShellPathResult> {
  if (!env.SHELL?.trim()) {
    env.SHELL = "/bin/zsh";
  }

  const loginShell = await readLoginShellPath(env, execFileFn);
  const mergedPath = mergePaths(
    loginShell.path ?? "",
    env.PATH ?? "",
    FALLBACK_PATHS.join(":"),
  );

  if (mergedPath) env.PATH = mergedPath;
  return {
    loaded: loginShell.path !== null,
    error: loginShell.error,
  };
}
