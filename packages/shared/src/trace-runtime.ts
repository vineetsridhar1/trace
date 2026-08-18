import { chmod, mkdir, readFile, rename, rm, writeFile } from "fs/promises";
import { createHash } from "crypto";
import { dirname, join } from "path";
import {
  BUNDLED_TRACE_RUNTIME_FILES,
  BUNDLED_TRACE_RUNTIME_MANIFEST,
} from "./trace-runtime.generated.js";

export type TraceRuntimePaths = {
  root: string;
  binDir: string;
  skillsDir: string;
};

type RuntimeManifest = {
  schemaVersion: 1;
  version: number;
  protocolVersion: number;
  contentHash: string;
  files: readonly string[];
};

type InstalledManifest = Pick<RuntimeManifest, "version" | "contentHash">;

async function installedManifest(root: string): Promise<InstalledManifest | null> {
  try {
    const parsed = JSON.parse(await readFile(join(root, "manifest.json"), "utf8")) as {
      version?: unknown;
      contentHash?: unknown;
    };
    return typeof parsed.version === "number" && typeof parsed.contentHash === "string"
      ? { version: parsed.version, contentHash: parsed.contentHash }
      : null;
  } catch {
    return null;
  }
}

function runtimeContentHash(manifest: RuntimeManifest, files: ReadonlyMap<string, string>): string {
  const hash = createHash("sha256");
  for (const relativePath of manifest.files) {
    const content = files.get(relativePath);
    if (content === undefined) throw new Error(`Missing Trace runtime file: ${relativePath}`);
    hash.update(relativePath);
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
  }
  return hash.digest("hex");
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
  // ENOENT just means there is no prior install. Anything else means the current
  // root cannot be staged for rollback — overlayfs returns EXDEV for renaming a
  // directory baked into a lower image layer — so clear the path directly, since
  // removal succeeds where rename does not. Swallowing every error here instead
  // leaves a non-empty root behind and turns the swap below into ENOTEMPTY.
  let displaced = false;
  try {
    await rename(root, previous);
    displaced = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      await rm(root, { recursive: true, force: true });
    }
  }
  try {
    await rename(next, root);
    await rm(previous, { recursive: true, force: true });
  } catch (error) {
    if (displaced) await rename(previous, root).catch(() => undefined);
    throw error;
  }
}

async function installFallback(root: string): Promise<void> {
  // The bridge release owns runtime distribution. Reinstall when either the monotonic version or
  // content hash changes so updates cannot be skipped because someone forgot to bump the version.
  const installed = await installedManifest(root);
  if (
    installed &&
    (installed.version > BUNDLED_TRACE_RUNTIME_MANIFEST.version ||
      (installed.version === BUNDLED_TRACE_RUNTIME_MANIFEST.version &&
        installed.contentHash === BUNDLED_TRACE_RUNTIME_MANIFEST.contentHash))
  ) {
    return;
  }
  const bundledFiles = new Map(Object.entries(BUNDLED_TRACE_RUNTIME_FILES));
  if (
    runtimeContentHash(BUNDLED_TRACE_RUNTIME_MANIFEST, bundledFiles) !==
    BUNDLED_TRACE_RUNTIME_MANIFEST.contentHash
  ) {
    throw new Error("Bundled Trace runtime content does not match its manifest");
  }
  await installFiles(root, BUNDLED_TRACE_RUNTIME_MANIFEST, bundledFiles);
}

export async function ensureTraceRuntime(root: string): Promise<TraceRuntimePaths> {
  await mkdir(dirname(root), { recursive: true });
  await installFallback(root);
  return { root, binDir: join(root, "bin"), skillsDir: join(root, "skills") };
}
