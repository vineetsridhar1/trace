import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { deleteOsCredential, readOsCredential, writeOsCredential } from "./credential-store.js";
import { CliError, ExitCode } from "./errors.js";

export type CliConfig = {
  serverUrl: string;
  activeOrganizationId?: string;
  deviceId?: string;
  deviceName?: string;
  installId: string;
};

const DEFAULT_SERVER = "https://app.gettrace.org";

export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  const root = env.TRACE_CONFIG_DIR?.trim() || join(homedir(), ".config", "trace");
  return join(root, "config.json");
}

export function credentialsPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(dirname(configPath(env)), "credentials.json");
}

export async function readConfig(env: NodeJS.ProcessEnv = process.env): Promise<CliConfig> {
  try {
    const value = JSON.parse(await readFile(configPath(env), "utf8")) as Partial<CliConfig>;
    return {
      serverUrl: normalizeServerUrl(value.serverUrl || DEFAULT_SERVER),
      activeOrganizationId: value.activeOrganizationId,
      deviceId: value.deviceId,
      deviceName: value.deviceName,
      installId: typeof value.installId === "string" ? value.installId : randomUUID(),
    };
  } catch {
    return { serverUrl: DEFAULT_SERVER, installId: randomUUID() };
  }
}

async function writeProtected(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await chmod(dirname(path), 0o700);
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, contents, { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, path);
}

export async function writeConfig(config: CliConfig, env: NodeJS.ProcessEnv = process.env) {
  await writeProtected(configPath(env), `${JSON.stringify(config, null, 2)}\n`);
}

export async function readStoredCredential(
  serverUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  const osCredential =
    env.TRACE_CREDENTIAL_STORE === "file"
      ? null
      : await readOsCredential(normalizeServerUrl(serverUrl));
  if (osCredential) return osCredential;
  try {
    const credentials = JSON.parse(await readFile(credentialsPath(env), "utf8")) as Record<
      string,
      unknown
    >;
    const value = credentials[normalizeServerUrl(serverUrl)];
    return typeof value === "string" && value ? value : null;
  } catch {
    return null;
  }
}

export async function writeStoredCredential(
  serverUrl: string,
  token: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (
    env.TRACE_CREDENTIAL_STORE !== "file" &&
    (await writeOsCredential(normalizeServerUrl(serverUrl), token))
  ) {
    return;
  }
  let credentials: Record<string, string> = {};
  try {
    const parsed = JSON.parse(await readFile(credentialsPath(env), "utf8")) as Record<
      string,
      unknown
    >;
    credentials = Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    // The protected file is the documented fallback when no credential-store adapter is installed.
  }
  credentials[normalizeServerUrl(serverUrl)] = token;
  await writeProtected(credentialsPath(env), `${JSON.stringify(credentials, null, 2)}\n`);
}

export async function deleteStoredCredential(
  serverUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (env.TRACE_CREDENTIAL_STORE !== "file") {
    await deleteOsCredential(normalizeServerUrl(serverUrl));
  }
  try {
    const parsed = JSON.parse(await readFile(credentialsPath(env), "utf8")) as Record<
      string,
      unknown
    >;
    const credentials = Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          entry[0] !== normalizeServerUrl(serverUrl) && typeof entry[1] === "string",
      ),
    );
    await writeProtected(credentialsPath(env), `${JSON.stringify(credentials, null, 2)}\n`);
  } catch {
    // Already logged out locally.
  }
}

export function normalizeServerUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CliError("Server URL is invalid", ExitCode.validation, "validation");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CliError(
      "Server URL must use http:// or https://",
      ExitCode.validation,
      "validation",
    );
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}
