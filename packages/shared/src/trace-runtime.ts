import { chmod, mkdir, readFile, rename, rm, writeFile } from "fs/promises";
import { dirname, join } from "path";
import {
  BUNDLED_TRACE_RUNTIME_FILES,
  BUNDLED_TRACE_RUNTIME_MANIFEST,
} from "./trace-runtime.generated.js";

const RUNTIME_REPOSITORY = "vineetsridhar1/trace";
const RUNTIME_PROTOCOL_VERSION = 1;

export type TraceRuntimePaths = {
  root: string;
  binDir: string;
  skillsDir: string;
};

type RuntimeManifest = {
  schemaVersion: 1;
  version: number;
  protocolVersion: number;
  files: readonly string[];
};

async function installedVersion(root: string): Promise<number> {
  try {
    const parsed = JSON.parse(await readFile(join(root, "manifest.json"), "utf8")) as {
      version?: unknown;
    };
    return typeof parsed.version === "number" ? parsed.version : 0;
  } catch {
    return 0;
  }
}

async function installFiles(
  root: string,
  manifest: RuntimeManifest,
  files: ReadonlyMap<string, string>,
) {
  const next = `${root}-next`;
  const previous = `${root}-previous`;
  await rm(next, { recursive: true, force: true });
  for (const [relativePath, content] of files) {
    const destination = join(next, relativePath);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content, "utf8");
  }
  await writeFile(join(next, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  await chmod(join(next, "bin/trace"), 0o755);

  await rm(previous, { recursive: true, force: true });
  await rename(root, previous).catch(() => undefined);
  try {
    await rename(next, root);
    await rm(previous, { recursive: true, force: true });
  } catch (error) {
    await rename(previous, root).catch(() => undefined);
    throw error;
  }
}

async function installFallback(root: string): Promise<void> {
  // The bundled copy ships with the bridge build, so a newer one means the runtime on disk is
  // stale. Only skipping when nothing is installed would pin every existing machine to whatever
  // version it first received, even as the skills it depends on change.
  if ((await installedVersion(root)) >= BUNDLED_TRACE_RUNTIME_MANIFEST.version) return;
  await installFiles(
    root,
    BUNDLED_TRACE_RUNTIME_MANIFEST,
    new Map(Object.entries(BUNDLED_TRACE_RUNTIME_FILES)),
  );
}

async function updateFromGitHub(root: string): Promise<void> {
  const commitResponse = await fetch(
    `https://api.github.com/repos/${RUNTIME_REPOSITORY}/commits/main`,
    { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(3_000) },
  );
  if (!commitResponse.ok) return;
  const commit = (await commitResponse.json()) as { sha?: unknown };
  if (typeof commit.sha !== "string") return;

  const base = `https://raw.githubusercontent.com/${RUNTIME_REPOSITORY}/${commit.sha}/runtime`;
  const manifestResponse = await fetch(`${base}/manifest.json`, {
    signal: AbortSignal.timeout(3_000),
  });
  if (!manifestResponse.ok) return;
  const manifest = (await manifestResponse.json()) as RuntimeManifest;
  if (
    manifest.schemaVersion !== 1 ||
    manifest.protocolVersion !== RUNTIME_PROTOCOL_VERSION ||
    !Number.isInteger(manifest.version) ||
    !Array.isArray(manifest.files) ||
    manifest.version <= (await installedVersion(root))
  ) {
    return;
  }

  const files = new Map<string, string>();
  await Promise.all(
    manifest.files.map(async (relativePath) => {
      if (
        typeof relativePath !== "string" ||
        relativePath.startsWith("/") ||
        relativePath.includes("..")
      ) {
        throw new Error("Invalid Trace runtime manifest path");
      }
      const response = await fetch(`${base}/${relativePath}`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) throw new Error(`Missing Trace runtime file: ${relativePath}`);
      files.set(relativePath, await response.text());
    }),
  );
  await installFiles(root, manifest, files);
}

export async function ensureTraceRuntime(root: string): Promise<TraceRuntimePaths> {
  await mkdir(dirname(root), { recursive: true });
  await installFallback(root);
  await updateFromGitHub(root).catch(() => undefined);
  return { root, binDir: join(root, "bin"), skillsDir: join(root, "skills") };
}
