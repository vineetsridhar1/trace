import { spawn } from "node:child_process";

const KEYCHAIN_SERVICE = "org.gettrace.cli";

async function run(
  command: string,
  args: string[],
  input?: string,
): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "ignore"] });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on("error", () => resolve({ ok: false, stdout: "" }));
    child.on("close", (code) => resolve({ ok: code === 0, stdout }));
    child.stdin.end(input === undefined ? undefined : `${input}\n`);
  });
}

export async function readOsCredential(serverUrl: string): Promise<string | null> {
  const result =
    process.platform === "darwin"
      ? await run("security", [
          "find-generic-password",
          "-a",
          serverUrl,
          "-s",
          KEYCHAIN_SERVICE,
          "-w",
        ])
      : process.platform === "linux"
        ? await run("secret-tool", ["lookup", "service", KEYCHAIN_SERVICE, "server", serverUrl])
        : { ok: false, stdout: "" };
  const secret = result.stdout.trim();
  return result.ok && secret ? secret : null;
}

export async function writeOsCredential(serverUrl: string, token: string): Promise<boolean> {
  const result =
    process.platform === "darwin"
      ? await run(
          "security",
          ["add-generic-password", "-U", "-a", serverUrl, "-s", KEYCHAIN_SERVICE, "-w"],
          token,
        )
      : process.platform === "linux"
        ? await run(
            "secret-tool",
            [
              "store",
              "--label",
              "Trace CLI credential",
              "service",
              KEYCHAIN_SERVICE,
              "server",
              serverUrl,
            ],
            token,
          )
        : { ok: false, stdout: "" };
  return result.ok;
}

export async function deleteOsCredential(serverUrl: string): Promise<void> {
  if (process.platform === "darwin") {
    await run("security", ["delete-generic-password", "-a", serverUrl, "-s", KEYCHAIN_SERVICE]);
  } else if (process.platform === "linux") {
    await run("secret-tool", ["clear", "service", KEYCHAIN_SERVICE, "server", serverUrl]);
  }
}
