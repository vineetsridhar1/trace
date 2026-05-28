import { describe, expect, it } from "vitest";
import { hydrateLoginShellPath } from "./shell-path.js";

describe("hydrateLoginShellPath", () => {
  it("sets a default shell when macOS Finder provides no SHELL", () => {
    const env: NodeJS.ProcessEnv = { PATH: "/usr/bin:/bin" };
    const execFileSync = (
      file: string,
      _args: string[],
      _options: { encoding: BufferEncoding; timeout: number; env: NodeJS.ProcessEnv },
    ) => {
      expect(file).toBe(process.platform === "win32" ? "" : "/bin/zsh");
      return "/custom/bin:/usr/bin";
    };

    hydrateLoginShellPath(env, execFileSync);

    if (process.platform === "win32") {
      expect(env.SHELL).toBeUndefined();
      return;
    }

    expect(env.SHELL).toBe("/bin/zsh");
    expect(env.PATH?.startsWith("/custom/bin:/usr/bin")).toBe(true);
  });
});
