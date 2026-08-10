import fs from "fs";
import os from "os";
import path from "path";

export function generalWorkspacePath(sessionKey: string, homeDir = os.homedir()): string {
  return path.join(homeDir, "trace", "general-sessions", sessionKey);
}

export async function removeGeneralWorkspace(
  workdir: string | undefined,
  sessionKey: string,
  homeDir = os.homedir(),
): Promise<boolean> {
  if (!workdir) return false;

  const root = path.resolve(homeDir, "trace", "general-sessions");
  const expected = path.resolve(generalWorkspacePath(sessionKey, homeDir));
  if (!sessionKey || path.dirname(expected) !== root) return false;
  if (path.resolve(workdir) !== expected) return false;

  await fs.promises.rm(expected, { recursive: true, force: true });
  return true;
}
