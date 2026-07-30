#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const MAX_OUTPUT_BYTES = 512 * 1024;
const RETRY_DELAYS_MS = [0, 100, 250, 500, 1_000, 1_500];

function fail(message, code = 1) {
  process.stderr.write(`trace: ${message}\n`);
  process.exit(code);
}

function usage() {
  fail("usage: trace output push --type visual-plan --file <path> (--draft | --final)", 2);
}

function parseArgs(argv) {
  if (argv[0] !== "output" || argv[1] !== "push") usage();

  let type;
  let file;
  let state;
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--type") {
      type = argv[++index];
    } else if (arg === "--file") {
      file = argv[++index];
    } else if (arg === "--draft") {
      if (state) usage();
      state = "draft";
    } else if (arg === "--final") {
      if (state) usage();
      state = "final";
    } else {
      usage();
    }
  }

  if (type !== "visual-plan" || !file || !state) usage();
  return { type, file, state };
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} is unavailable; run this command inside a Trace agent session`);
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestWithRunActivationRetry(url, options) {
  let response;
  for (const delay of RETRY_DELAYS_MS) {
    if (delay > 0) await sleep(delay);
    response = await fetch(url, options);
    if (response.status !== 409) return response;
  }
  return response;
}

async function main() {
  const input = parseArgs(process.argv.slice(2));
  const apiUrl = requiredEnv("TRACE_API_URL");
  const runToken = requiredEnv("TRACE_RUN_TOKEN");
  const runId = requiredEnv("TRACE_RUN_ID");
  const sessionId = requiredEnv("TRACE_SESSION_ID");
  const filePath = path.resolve(input.file);

  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat?.isFile()) fail(`output file does not exist: ${filePath}`);
  if (fileStat.size > MAX_OUTPUT_BYTES) {
    fail(`output file exceeds ${MAX_OUTPUT_BYTES} bytes`);
  }

  const content = await readFile(filePath, "utf8");
  if (!content.trim()) fail("output file is empty");
  if (Buffer.byteLength(content, "utf8") > MAX_OUTPUT_BYTES) {
    fail(`output file exceeds ${MAX_OUTPUT_BYTES} bytes`);
  }

  const endpoint = new URL("/agent/outputs", apiUrl);
  let response;
  try {
    response = await requestWithRunActivationRetry(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${runToken}`,
        "content-type": "application/json",
        "x-trace-cli-version": "1",
      },
      body: JSON.stringify({
        type: input.type,
        state: input.state,
        runId,
        sessionId,
        filename: path.basename(filePath),
        sourcePath: filePath,
        content,
        contentHash: createHash("sha256").update(content).digest("hex"),
      }),
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : "failed to reach Trace");
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const errors =
      payload && Array.isArray(payload.validationErrors)
        ? payload.validationErrors.filter((value) => typeof value === "string")
        : [];
    const message =
      errors.length > 0
        ? `visual plan is invalid:\n${errors.map((error) => `- ${error}`).join("\n")}`
        : payload && typeof payload.error === "string"
          ? payload.error
          : `server returned ${response.status}`;
    fail(message);
  }

  const validationErrors =
    payload && Array.isArray(payload.validationErrors)
      ? payload.validationErrors.filter((value) => typeof value === "string")
      : [];
  const label = input.state === "final" ? "submitted for review" : "draft uploaded";
  process.stdout.write(`Trace visual plan ${label} (${payload?.contentHash ?? "unknown hash"}).\n`);
  if (validationErrors.length > 0) {
    process.stdout.write(
      `Validation warnings:\n${validationErrors.map((error) => `- ${error}`).join("\n")}\n`,
    );
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
