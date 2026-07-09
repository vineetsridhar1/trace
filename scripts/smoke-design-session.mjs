import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const serverUrl = requiredEnv("TRACE_SMOKE_SERVER_URL").replace(/\/$/, "");
const authToken = requiredEnv("TRACE_SMOKE_AUTH_TOKEN");
const organizationId = requiredEnv("TRACE_SMOKE_ORG_ID");
const prompt =
  process.env.TRACE_SMOKE_DESIGN_PROMPT ??
  [
    "Create three dashboard design directions for a small CRM approval workflow.",
    "Keep the exact text TRACE_SMOKE_DESIGN_READY visible in every artifact.",
    "Use stable data-el anchors and CSS variables.",
  ].join(" ");
const expectedText = process.env.TRACE_SMOKE_DESIGN_EXPECTED_TEXT ?? "TRACE_SMOKE_DESIGN_READY";
const timeoutMs = readDurationEnv("TRACE_SMOKE_TIMEOUT_MS", 10 * 60 * 1000);
const pollMs = readDurationEnv("TRACE_SMOKE_POLL_MS", 3000);
const skipBrowser = process.env.TRACE_SMOKE_SKIP_BROWSER === "1";

const chromeCandidates = [
  process.env.TRACE_CHROMIUM_EXECUTABLE,
  process.env.CHROMIUM_EXECUTABLE_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
].filter(Boolean);

const chromeExecutable = skipBrowser
  ? null
  : chromeCandidates.find((candidate) => fs.existsSync(candidate));

if (!skipBrowser && !chromeExecutable) {
  throw new Error(
    "A Chrome/Chromium binary is required. Set TRACE_CHROMIUM_EXECUTABLE, or set TRACE_SMOKE_SKIP_BROWSER=1 only for non-acceptance debugging.",
  );
}

const START_DESIGN_SESSION = `
  mutation SmokeStartDesignSession($input: StartSessionInput!) {
    startSession(input: $input) {
      id
      sessionGroupId
      sessionGroup {
        id
        kind
        repo {
          id
        }
        connection {
          state
        }
      }
    }
  }
`;

const DESIGN_ARTIFACTS = `
  query SmokeDesignArtifacts($sessionGroupId: ID!) {
    designArtifacts(sessionGroupId: $sessionGroupId) {
      id
      sessionGroupId
      parentArtifactId
      title
      prompt
      html
      metadata
      publishedAt
      publicUrl
      createdAt
    }
  }
`;

const SESSION_USAGE = `
  query SmokeSessionUsage($sessionId: ID!) {
    session(id: $sessionId) {
      id
      inputTokens
      outputTokens
      cacheReadTokens
      cacheCreationTokens
      costUsd
    }
  }
`;

const GENERATE_DESIGN_ARTIFACTS = `
  mutation SmokeGenerateDesignArtifacts($sessionGroupId: ID!, $prompt: String!, $directionCount: Int) {
    generateDesignArtifacts(sessionGroupId: $sessionGroupId, prompt: $prompt, directionCount: $directionCount) {
      id
      parentArtifactId
      html
      metadata
    }
  }
`;

const COMMENT_DESIGN_ARTIFACT = `
  mutation SmokeCommentDesignArtifact($artifactId: ID!, $body: String!, $anchor: JSON, $sendToAgent: Boolean) {
    commentDesignArtifact(artifactId: $artifactId, body: $body, anchor: $anchor, sendToAgent: $sendToAgent) {
      id
      eventType
      payload
    }
  }
`;

const PATCH_DESIGN_ARTIFACT_TOKENS = `
  mutation SmokePatchDesignArtifactTokens($artifactId: ID!, $tokens: JSON!) {
    patchDesignArtifactTokens(artifactId: $artifactId, tokens: $tokens) {
      id
      parentArtifactId
      html
      metadata
    }
  }
`;

const EXPORT_DESIGN_ARTIFACT_PDF = `
  mutation SmokeExportDesignArtifactPdf($artifactId: ID!) {
    exportDesignArtifactPdf(artifactId: $artifactId) {
      id
      eventType
      payload
    }
  }
`;

const PUBLISH_DESIGN_ARTIFACT = `
  mutation SmokePublishDesignArtifact($artifactId: ID!) {
    publishDesignArtifact(artifactId: $artifactId) {
      id
      publishedAt
      publicUrl
      html
    }
  }
`;

const PROMOTE_DESIGN_ARTIFACT = `
  mutation SmokePromoteDesignArtifact($artifactId: ID!, $prompt: String) {
    promoteDesignArtifactToCodingSession(artifactId: $artifactId, prompt: $prompt) {
      id
      sessionGroupId
      sessionGroup {
        id
        kind
        forkedFromSessionGroupId
      }
    }
  }
`;

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function readDurationEnv(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive number`);
  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function graphql(query, variables = {}) {
  const response = await fetch(`${serverUrl}/graphql`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${authToken}`,
      "x-organization-id": organizationId,
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.errors?.length) {
    const detail = body?.errors?.map((error) => error.message).join("; ") ?? response.statusText;
    throw new Error(`GraphQL request failed: ${detail}`);
  }
  return body.data;
}

async function pollUntil(label, fn) {
  const deadline = Date.now() + timeoutMs;
  let lastDetail = "not checked yet";
  while (Date.now() < deadline) {
    const result = await fn();
    if (result.ok) return result.value;
    lastDetail = result.detail ?? lastDetail;
    process.stdout.write(`Waiting for ${label}: ${lastDetail}\n`);
    await sleep(pollMs);
  }
  throw new Error(`Timed out waiting for ${label}: ${lastDetail}`);
}

async function waitForArtifacts(sessionGroupId, minimumCount) {
  return pollUntil(`${minimumCount} design artifact(s)`, async () => {
    const data = await graphql(DESIGN_ARTIFACTS, { sessionGroupId });
    const artifacts = data.designArtifacts ?? [];
    if (artifacts.length < minimumCount) {
      return { ok: false, detail: `${artifacts.length} artifact(s) found` };
    }
    return { ok: true, value: artifacts };
  });
}

async function waitForChildArtifact(sessionGroupId, parentArtifactId, label) {
  return pollUntil(`${label} child artifact`, async () => {
    const data = await graphql(DESIGN_ARTIFACTS, { sessionGroupId });
    const artifacts = data.designArtifacts ?? [];
    const child = artifacts.find((artifact) => artifact.parentArtifactId === parentArtifactId);
    if (!child) {
      return { ok: false, detail: `no child artifact for ${parentArtifactId}` };
    }
    return { ok: true, value: child };
  });
}

async function waitForDesignUsage(sessionId) {
  return pollUntil("design generation usage", async () => {
    const data = await graphql(SESSION_USAGE, { sessionId });
    const session = data.session;
    if (!session) return { ok: false, detail: "session not found" };
    const inputTokens = Number(session.inputTokens ?? 0);
    const outputTokens = Number(session.outputTokens ?? 0);
    if (inputTokens <= 0 || outputTokens <= 0) {
      return {
        ok: false,
        detail: `input=${inputTokens} output=${outputTokens}`,
      };
    }
    return { ok: true, value: session };
  });
}

function assertArtifactHtml(artifact, label) {
  if (!artifact.html?.includes(expectedText)) {
    throw new Error(`${label} artifact ${artifact.id} did not contain ${expectedText}`);
  }
}

function asPayload(event, label) {
  const payload = event?.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`${label} event payload is missing`);
  }
  return payload;
}

function asObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is missing`);
  }
  return value;
}

function assertLlmArtifactMetadata(artifact, label, expectedSource) {
  const metadata = asObject(artifact.metadata, `${label} metadata`);
  if (metadata.generator !== "llm") {
    throw new Error(`${label} generator is ${metadata.generator ?? "missing"}`);
  }
  if (metadata.promptComposer !== "trace-open-design-v1") {
    throw new Error(`${label} promptComposer is ${metadata.promptComposer ?? "missing"}`);
  }
  if (expectedSource && metadata.source !== expectedSource) {
    throw new Error(`${label} source is ${metadata.source ?? "missing"}`);
  }
}

async function assertUrlRenders(url, label) {
  const response = await fetch(url, { redirect: "follow" });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}: ${body.slice(0, 500)}`);
  }
  if (!body.includes(expectedText)) {
    throw new Error(`${label} fetch did not contain ${expectedText}`);
  }

  if (skipBrowser) return;

  const profileDir = await fsp.mkdtemp(path.join(os.tmpdir(), "trace-design-smoke-"));
  try {
    const { stdout } = await execFileAsync(
      chromeExecutable,
      [
        "--headless=new",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--no-default-browser-check",
        "--no-proxy-server",
        `--user-data-dir=${profileDir}`,
        "--virtual-time-budget=5000",
        "--dump-dom",
        url,
      ],
      { maxBuffer: 20 * 1024 * 1024, timeout: 45_000 },
    );
    if (!stdout.includes(expectedText)) {
      throw new Error(`${label} browser DOM did not contain ${expectedText}`);
    }
  } finally {
    await fsp.rm(profileDir, { recursive: true, force: true });
  }
}

async function assertBootstrapDoesNotLeakContent(url, label) {
  const bootstrapUrl = new URL(url);
  bootstrapUrl.pathname = "/_bootstrap";
  bootstrapUrl.search = "";
  bootstrapUrl.hash = "";
  const response = await fetch(bootstrapUrl, { redirect: "follow" });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${label} bootstrap returned HTTP ${response.status}: ${body.slice(0, 500)}`);
  }
  if (!body.includes("trace:artifact:render")) {
    throw new Error(`${label} bootstrap did not return the artifact bootstrap shell`);
  }
  if (body.includes(expectedText)) {
    throw new Error(`${label} bootstrap leaked published artifact content`);
  }
}

async function assertPdfDownload(url, label) {
  const response = await fetch(url, { redirect: "follow" });
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}`);
  }
  if (bytes.byteLength === 0) {
    throw new Error(`${label} returned an empty file`);
  }
  const header = new TextDecoder().decode(bytes.slice(0, 5));
  if (header !== "%PDF-") {
    throw new Error(`${label} did not return a PDF`);
  }
}

process.stdout.write("Starting fresh design session smoke...\n");
const startData = await graphql(START_DESIGN_SESSION, {
  input: {
    kind: "design",
    prompt,
    ...(process.env.TRACE_SMOKE_DESIGN_SYSTEM_ID
      ? { designSystemId: process.env.TRACE_SMOKE_DESIGN_SYSTEM_ID }
      : {}),
    ...(process.env.TRACE_SMOKE_DESIGN_SKILL_IDS
      ? {
          designSkillIds: process.env.TRACE_SMOKE_DESIGN_SKILL_IDS.split(",")
            .map((id) => id.trim())
            .filter(Boolean),
        }
      : {}),
  },
});

const session = startData.startSession;
if (session.sessionGroup?.kind !== "design") {
  throw new Error(`Started group kind is ${session.sessionGroup?.kind ?? "missing"}`);
}
if (session.sessionGroup?.repo) {
  throw new Error("Design sessions must start without a repo");
}
if (session.sessionGroup?.connection) {
  throw new Error("Design sessions must not attach a runtime connection");
}

const initialArtifacts = await waitForArtifacts(session.sessionGroupId, 1);
assertArtifactHtml(initialArtifacts[0], "Initial");
assertLlmArtifactMetadata(initialArtifacts[0], "Initial", "startSession");

const generatedData = await graphql(GENERATE_DESIGN_ARTIFACTS, {
  sessionGroupId: session.sessionGroupId,
  prompt,
  directionCount: 3,
});
const generatedArtifacts = generatedData.generateDesignArtifacts ?? [];
if (generatedArtifacts.length !== 3) {
  throw new Error(`Expected 3 generated directions, got ${generatedArtifacts.length}`);
}
for (const artifact of generatedArtifacts) {
  if (artifact.parentArtifactId !== null) {
    throw new Error(`Generated direction ${artifact.id} unexpectedly has a parent artifact`);
  }
  assertArtifactHtml(artifact, "Generated direction");
  assertLlmArtifactMetadata(artifact, "Generated direction", "generateDesignArtifacts");
}
const usage = await waitForDesignUsage(session.id);

const selected = generatedArtifacts[0];
const commentData = await graphql(COMMENT_DESIGN_ARTIFACT, {
  artifactId: selected.id,
  body: "Smoke comment pinned to the hero",
  anchor: { type: "element", dataEl: "hero", text: expectedText },
  sendToAgent: true,
});
if (commentData.commentDesignArtifact.eventType !== "design_comment_added") {
  throw new Error(`Unexpected comment event ${commentData.commentDesignArtifact.eventType}`);
}
const commentIteration = await waitForChildArtifact(
  session.sessionGroupId,
  selected.id,
  "comment-driven iteration",
);
assertArtifactHtml(commentIteration, "Comment-driven iteration");

const tweakData = await graphql(PATCH_DESIGN_ARTIFACT_TOKENS, {
  artifactId: selected.id,
  tokens: { "--trace-smoke-accent": "#0f766e" },
});
const tweaked = tweakData.patchDesignArtifactTokens;
if (tweaked.parentArtifactId !== selected.id) {
  throw new Error("Token tweak did not create a child artifact version");
}
assertArtifactHtml(tweaked, "Tweaked");
if (!tweaked.html.includes("--trace-smoke-accent: #0f766e;")) {
  throw new Error("Token tweak did not patch the requested CSS variable");
}
const tweakMetadata = asObject(tweaked.metadata, "Token tweak metadata");
if (tweakMetadata.source !== "patchDesignArtifactTokens") {
  throw new Error(`Token tweak source is ${tweakMetadata.source ?? "missing"}`);
}
const patchedTokens = asObject(tweakMetadata.patchedTokens, "Token tweak patchedTokens");
if (patchedTokens["--trace-smoke-accent"] !== "#0f766e") {
  throw new Error("Token tweak metadata does not include the requested CSS variable");
}

const exportData = await graphql(EXPORT_DESIGN_ARTIFACT_PDF, { artifactId: tweaked.id });
if (exportData.exportDesignArtifactPdf.eventType !== "design_export_completed") {
  throw new Error(`Unexpected export event ${exportData.exportDesignArtifactPdf.eventType}`);
}
const exportPayload = asPayload(exportData.exportDesignArtifactPdf, "Export");
if (exportPayload.status !== "completed") {
  throw new Error(`PDF export status is ${exportPayload.status ?? "missing"}`);
}
if (typeof exportPayload.fileUrl !== "string" || !exportPayload.fileUrl.trim()) {
  throw new Error("PDF export fileUrl is missing");
}
if (typeof exportPayload.byteSize !== "number" || exportPayload.byteSize <= 0) {
  throw new Error("PDF export byteSize is missing or empty");
}
await assertPdfDownload(exportPayload.fileUrl, "PDF export URL");

const publishData = await graphql(PUBLISH_DESIGN_ARTIFACT, { artifactId: tweaked.id });
const published = publishData.publishDesignArtifact;
if (!published.publishedAt) throw new Error("Published artifact is missing publishedAt");
if (!published.publicUrl) throw new Error("Published artifact publicUrl is missing");
assertArtifactHtml(published, "Published");
await assertUrlRenders(published.publicUrl, "published design artifact URL");
await assertBootstrapDoesNotLeakContent(published.publicUrl, "published design artifact URL");

const promoteData = await graphql(PROMOTE_DESIGN_ARTIFACT, {
  artifactId: tweaked.id,
  prompt: "Implement the smoke-verified design artifact.",
});
const promoted = promoteData.promoteDesignArtifactToCodingSession;
if (promoted.sessionGroup?.kind !== "coding") {
  throw new Error(`Promoted group kind is ${promoted.sessionGroup?.kind ?? "missing"}`);
}
if (promoted.sessionGroup?.forkedFromSessionGroupId !== session.sessionGroupId) {
  throw new Error("Promoted coding session is not linked to the source design group");
}

process.stdout.write(
  [
    "Trace design session smoke passed.",
    `Design session: ${session.id}`,
    `Design group: ${session.sessionGroupId}`,
    `Design usage: ${usage.inputTokens} input / ${usage.outputTokens} output tokens`,
    `Generated artifacts: ${generatedArtifacts.map((artifact) => artifact.id).join(", ")}`,
    `Tweaked artifact: ${tweaked.id}`,
    `PDF export: ${exportPayload.fileUrl}`,
    `Published URL: ${published.publicUrl}`,
    `Promoted coding session: ${promoted.id}`,
    `Promoted coding group: ${promoted.sessionGroupId}`,
  ].join("\n") + "\n",
);
