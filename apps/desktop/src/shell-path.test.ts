import { describe, expect, it, vi } from "vitest";
import { hydrateLoginShellPath } from "./shell-path.js";

describe("hydrateLoginShellPath", () => {
  it("loads PATH from a slow login shell despite surrounding output", () => {
    const env: NodeJS.ProcessEnv = { PATH: "/usr/bin:/bin" };
    const execFileSync = (
      file: string,
      args: string[],
      options: { encoding: BufferEncoding; timeout: number; env: NodeJS.ProcessEnv },
    ) => {
      expect(file).toBe(process.platform === "win32" ? "" : "/bin/zsh");
      expect(args).toEqual([
        "-lic",
        'printf "\\n__TRACE_LOGIN_SHELL_PATH__=%s\\n" "$PATH"',
      ]);
      expect(options.timeout).toBe(10_000);
      return [
        "shell startup message",
        "__TRACE_LOGIN_SHELL_PATH__=/custom/bin:/usr/bin",
        "shell shutdown message",
      ].join("\n");
    };

    hydrateLoginShellPath(env, execFileSync);

    if (process.platform === "win32") {
      expect(env.SHELL).toBeUndefined();
      return;
    }

    expect(env.SHELL).toBe("/bin/zsh");
    expect(env.PATH?.startsWith("/custom/bin:/usr/bin")).toBe(true);
  });

  it("logs shell failures and keeps fallback paths", () => {
    if (process.platform === "win32") return;

    const env: NodeJS.ProcessEnv = { PATH: "/usr/bin:/bin", SHELL: "/bin/zsh" };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    hydrateLoginShellPath(env, () => {
      throw new Error("shell timed out");
    });

    expect(warn).toHaveBeenCalledWith(
      "[shell-path] failed to load login-shell PATH: shell timed out",
    );
    expect(env.PATH?.split(":")).toEqual(
      expect.arrayContaining(["/usr/bin", "/bin", "/opt/homebrew/bin", "/usr/local/bin"]),
    );
    warn.mockRestore();
  });
});
