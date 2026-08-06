#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function fail(message) {
  process.stderr.write(`trace: ${message}\n`);
  process.exit(1);
}

function invocationEnvironment() {
  const apiUrl = process.env.TRACE_API_URL;
  const token = process.env.TRACE_INVOCATION_TOKEN;
  if (!apiUrl || !token) fail("this command is only available inside an active Trace session");
  return { apiUrl, token };
}

async function readResponseError(response, fallback) {
  const result = await response.json().catch(() => ({}));
  return typeof result.error === "string" ? result.error : fallback;
}

async function pushArtifact(args) {
  if (!args[0] || !args[1]) {
    fail("usage: trace artifact push <type> <file-or-directory> [--key <key>]");
  }
  const type = args[0];
  const source = resolve(args[1]);
  let key = type === "visual-plan" || type === "trace.visual-plan.v1" ? "primary" : "default";
  for (let index = 2; index < args.length; index += 1) {
    if (args[index] !== "--key" || !args[index + 1]) fail("invalid arguments");
    key = args[index + 1];
    index += 1;
  }
  if (!existsSync(source)) fail(`path does not exist: ${source}`);
  const { apiUrl, token } = invocationEnvironment();

  const temp = mkdtempSync(join(tmpdir(), "trace-artifact-"));
  const archivePath = join(temp, "artifact.tar.gz");
  try {
    const sourceStat = statSync(source);
    const tarArgs = sourceStat.isDirectory()
      ? ["-czf", archivePath, "-C", source, "."]
      : ["-czf", archivePath, "-C", dirname(source), basename(source)];
    const packed = spawnSync("tar", tarArgs, {
      stdio: "inherit",
      env: { ...process.env, COPYFILE_DISABLE: "1" },
    });
    if (packed.status !== 0) fail("could not package artifact");

    const response = await fetch(new URL("/agent/artifacts", apiUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/gzip",
        "X-Trace-Artifact-Type": type,
        "X-Trace-Artifact-Key": key,
        "X-Trace-Idempotency-Key": randomUUID(),
      },
      body: readFileSync(archivePath),
    });
    if (!response.ok) fail(await readResponseError(response, "upload failed"));
    const result = await response.json();
    process.stdout.write(`${result.artifact.id}\n`);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

async function listDesigns() {
  const { apiUrl, token } = invocationEnvironment();
  const response = await fetch(new URL("/agent/designs", apiUrl), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) fail(await readResponseError(response, "could not list linked designs"));
  const result = await response.json();
  if (!Array.isArray(result.designs)) fail("server returned an invalid design list");
  return result.designs;
}

async function pullDesign(design) {
  if (
    typeof design.id !== "string" ||
    typeof design.slug !== "string" ||
    typeof design.commitSha !== "string" ||
    typeof design.archivePath !== "string" ||
    !/^[a-z0-9][a-z0-9-]*$/.test(design.slug)
  ) {
    fail("server returned invalid design metadata");
  }
  const { apiUrl, token } = invocationEnvironment();
  const response = await fetch(new URL(design.archivePath, apiUrl), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) fail(await readResponseError(response, `could not pull ${design.slug}`));
  const pulledCommitSha = response.headers.get("x-trace-design-commit");
  if (!pulledCommitSha) fail("server did not identify the pulled design commit");

  const temp = mkdtempSync(join(tmpdir(), "trace-design-"));
  const archivePath = join(temp, "design.tar.gz");
  const extractedPath = join(temp, "source");
  const destinationParent = resolve(".trace/designs");
  const destination = join(destinationParent, design.slug);
  const previous = join(destinationParent, `.${design.slug}.previous-${randomUUID()}`);
  try {
    mkdirSync(extractedPath, { recursive: true });
    writeFileSync(archivePath, Buffer.from(await response.arrayBuffer()));
    const unpacked = spawnSync("tar", ["-xzf", archivePath, "-C", extractedPath], {
      stdio: "inherit",
    });
    if (unpacked.status !== 0) fail(`could not unpack ${design.slug}`);

    mkdirSync(destinationParent, { recursive: true });
    const replacing = existsSync(destination);
    if (replacing) renameSync(destination, previous);
    try {
      renameSync(extractedPath, destination);
      if (replacing) rmSync(previous, { recursive: true, force: true });
    } catch (error) {
      if (replacing && !existsSync(destination) && existsSync(previous)) {
        renameSync(previous, destination);
      }
      throw error;
    }
    process.stdout.write(`${design.slug} ${pulledCommitSha}\n`);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

async function runDesignCommand(args) {
  if (args[0] === "list") {
    if (args.length > 2 || (args[1] && args[1] !== "--json")) {
      fail("usage: trace design list [--json]");
    }
    const designs = await listDesigns();
    if (args[1] === "--json") {
      process.stdout.write(`${JSON.stringify(designs, null, 2)}\n`);
      return;
    }
    for (const design of designs) {
      process.stdout.write(`${design.slug}\t${design.commitSha}\t${design.name}\n`);
    }
    return;
  }
  if (args[0] === "pull") {
    if (args.length > 2) fail("usage: trace design pull [<id-or-slug>]");
    const designs = await listDesigns();
    const selector = args[1];
    const selected = selector
      ? designs.filter((design) => design.id === selector || design.slug === selector)
      : designs;
    if (selected.length === 0) {
      fail(
        selector ? `linked design not found: ${selector}` : "no designs are linked to this session",
      );
    }
    for (const design of selected) await pullDesign(design);
    return;
  }
  fail("usage: trace design <list|pull>");
}

const args = process.argv.slice(2);
if (args[0] === "artifact" && args[1] === "push") {
  await pushArtifact(args.slice(2));
} else if (args[0] === "design") {
  await runDesignCommand(args.slice(1));
} else {
  fail("usage: trace <artifact|design> ...");
}
