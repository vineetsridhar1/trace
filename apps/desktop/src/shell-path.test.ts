import { describe, expect, it } from "vitest";
import { hydrateLoginShellPath } from "./shell-path.js";

describe("hydrateLoginShellPath", () => {
  it("loads an NVM path from the login shell despite surrounding output", async () => {
    const env: NodeJS.ProcessEnv = { PATH: "/usr/bin:/bin" };
    const execFile = async (
      file: string,
      args: string[],
      options: { timeout: number; env: NodeJS.ProcessEnv },
    ) => {
      expect(file).toBe("/bin/zsh");
      expect(args).toEqual(["-lic", 'printf "\\n__TRACE_LOGIN_SHELL_PATH__=%s\\n" "$PATH"']);
      expect(options.timeout).toBe(10_000);
      return [
        "shell startup message",
        "__TRACE_LOGIN_SHELL_PATH__=/Users/example/.nvm/versions/node/v22/bin:/usr/bin:/bin",
        "later shell output",
      ].join("\n");
    };

    const result = await hydrateLoginShellPath(env, execFile);

    expect(result).toEqual({ loaded: true, error: null });
    expect(env.SHELL).toBe("/bin/zsh");
    expect(env.PATH?.startsWith("/Users/example/.nvm/versions/node/v22/bin:/usr/bin:/bin")).toBe(
      true,
    );
  });

  it("keeps fallback paths when the login shell fails", async () => {
    const env: NodeJS.ProcessEnv = {
      HOME: "/Users/example",
      PATH: "/usr/bin:/bin",
      SHELL: "/bin/zsh",
    };

    const result = await hydrateLoginShellPath(env, async () => {
      throw new Error("shell failed");
    });

    expect(result).toEqual({ loaded: false, error: "shell failed" });
    expect(env.PATH?.split(":")).toEqual(
      expect.arrayContaining(["/usr/bin", "/bin", "/opt/homebrew/bin", "/usr/local/bin"]),
    );
  });
});
