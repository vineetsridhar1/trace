#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function fail(message) {
  process.stderr.write(`trace: ${message}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
if (args[0] !== "artifact" || args[1] !== "push" || !args[2] || !args[3]) {
  fail("usage: trace artifact push <type> <file-or-directory> [--key <key>]");
}

const type = args[2];
const source = resolve(args[3]);
let key = type === "visual-plan" || type === "trace.visual-plan.v1" ? "primary" : "default";
for (let index = 4; index < args.length; index += 1) {
  if (args[index] !== "--key" || !args[index + 1]) fail("invalid arguments");
  key = args[index + 1];
  index += 1;
}

if (!existsSync(source)) fail(`path does not exist: ${source}`);
const apiUrl = process.env.TRACE_API_URL;
const token = process.env.TRACE_INVOCATION_TOKEN;
if (!apiUrl || !token) fail("this command is only available inside an active Trace session");

if (type === "video" || type === "trace.video.v1") {
  if (!statSync(source).isFile()) fail("video artifacts require one video file");
  const validator = process.env.TRACE_BROWSER_VIDEO_VALIDATE;
  if (!validator) fail("browser video validation is unavailable");
  const validated = spawnSync(validator, [source], { stdio: "inherit", env: process.env });
  if (validated.status !== 0) fail("video validation failed; artifact was not uploaded");
}

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
  const result = await response.json().catch(() => ({}));
  if (!response.ok) fail(typeof result.error === "string" ? result.error : "upload failed");
  process.stdout.write(`${result.artifact.id}\n`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
