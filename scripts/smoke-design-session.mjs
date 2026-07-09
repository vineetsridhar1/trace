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
      hosting
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

const SESSION_EVENTS = `
  query SmokeSessionEvents($organizationId: ID!, $sessionId: ID!, $types: [String!]) {
    events(
      organizationId: $organizationId
      scope: { type: session, id: $sessionId }
      types: $types
      limit: 1000
    ) {
      id
      eventType
      payload
      timestamp
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
      publishedAt
      publicUrl
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
      publishedAt
      publicUrl
    }
  }
`;

const EXPORT_DESIGN_ARTIFACT_PDF = `
  mutation SmokeExportDesignArtifactPdf($artifactId: ID!, $pageOptions: DesignPdfPageOptionsInput) {
    exportDesignArtifactPdf(artifactId: $artifactId, pageOptions: $pageOptions) {
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
  mutation SmokePromoteDesignArtifact($artifactId: ID!, $prompt: String, $referenceArtifactIds: [ID!]) {
    promoteDesignArtifactToCodingSession(
      artifactId: $artifactId
      prompt: $prompt
      referenceArtifactIds: $referenceArtifactIds
    ) {
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

async function waitForPromotedBrief(sessionId) {
  return pollUntil("promoted coding session brief", async () => {
    const data = await graphql(SESSION_EVENTS, {
      organizationId,
      sessionId,
      types: ["session_started"],
    });
    const started = data.events?.find((event) => event.eventType === "session_started");
    const payload = started?.payload;
    const prompt = payload && typeof payload === "object" ? payload.prompt : null;
    if (typeof prompt !== "string") {
      return { ok: false, detail: "session_started prompt not found" };
    }
    return { ok: true, value: prompt };
  });
}

async function waitForPromotionEvent(sessionId, artifactId, referenceArtifactIds, promotedSession) {
  return pollUntil("design artifact promotion event", async () => {
    const data = await graphql(SESSION_EVENTS, {
      organizationId,
      sessionId,
      types: ["design_artifact_promoted"],
    });
    const promotion = data.events?.find((event) => {
      if (event.eventType !== "design_artifact_promoted") return false;
      const payload = event.payload;
      return (
        payload &&
        typeof payload === "object" &&
        !Array.isArray(payload) &&
        payload.artifactId === artifactId &&
        payload.promotedSessionId === promotedSession.id
      );
    });
    if (!promotion) {
      return { ok: false, detail: `no promotion event for ${artifactId}` };
    }
    const payload = asPayload(promotion, "Promotion");
    const actualReferences = Array.isArray(payload.referenceArtifactIds)
      ? payload.referenceArtifactIds
      : [];
    const missingReferences = referenceArtifactIds.filter((id) => !actualReferences.includes(id));
    if (missingReferences.length > 0) {
      throw new Error(
        `Promotion event is missing reference artifacts ${missingReferences.join(", ")}`,
      );
    }
    if (payload.sessionGroupId !== promotedSession.sessionGroup?.forkedFromSessionGroupId) {
      throw new Error(`Promotion event source group is ${payload.sessionGroupId ?? "missing"}`);
    }
    if (payload.promotedSessionGroupId !== promotedSession.sessionGroupId) {
      throw new Error(
        `Promotion event target group is ${payload.promotedSessionGroupId ?? "missing"}`,
      );
    }
    return { ok: true, value: promotion };
  });
}

async function waitForPdfExportTimelineEvents(sessionId, artifactId, exportPayload) {
  return pollUntil("PDF export timeline events", async () => {
    const data = await graphql(SESSION_EVENTS, {
      organizationId,
      sessionId,
      types: ["design_export_requested", "design_export_completed"],
    });
    const events = data.events ?? [];
    const requestedIndex = events.findIndex((event) => {
      if (event.eventType !== "design_export_requested") return false;
      const payload = event.payload;
      return (
        payload &&
        typeof payload === "object" &&
        !Array.isArray(payload) &&
        payload.artifactId === artifactId &&
        payload.exportType === "pdf" &&
        payload.status === "requested"
      );
    });
    const completedIndex = events.findIndex((event) => {
      if (event.eventType !== "design_export_completed") return false;
      const payload = event.payload;
      return (
        payload &&
        typeof payload === "object" &&
        !Array.isArray(payload) &&
        payload.artifactId === artifactId &&
        payload.status === "completed" &&
        payload.fileId === exportPayload.fileId
      );
    });
    if (requestedIndex < 0 || completedIndex < 0) {
      return {
        ok: false,
        detail: `requested=${requestedIndex >= 0} completed=${completedIndex >= 0}`,
      };
    }
    if (completedIndex <= requestedIndex) {
      throw new Error("PDF export completed event arrived before the requested event");
    }
    const completedPayload = asPayload(events[completedIndex], "PDF export timeline completion");
    for (const key of ["fileUrl", "fileName", "byteSize", "sessionGroupId"]) {
      if (completedPayload[key] !== exportPayload[key]) {
        throw new Error(
          `PDF export timeline ${key} is ${completedPayload[key] ?? "missing"}, expected ${exportPayload[key] ?? "missing"}`,
        );
      }
    }
    return { ok: true, value: events };
  });
}

async function waitForPublishedArtifactEvent(sessionId, artifactId, publicUrl) {
  return pollUntil("published design artifact event", async () => {
    const data = await graphql(SESSION_EVENTS, {
      organizationId,
      sessionId,
      types: ["design_artifact_updated"],
    });
    const event = data.events?.find((candidate) => {
      if (candidate.eventType !== "design_artifact_updated") return false;
      const payload = candidate.payload;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
      const artifact = payload.artifact;
      return (
        payload.published === true &&
        artifact &&
        typeof artifact === "object" &&
        !Array.isArray(artifact) &&
        artifact.id === artifactId &&
        typeof artifact.publishedAt === "string" &&
        artifact.publicUrl === publicUrl
      );
    });
    if (!event) {
      return { ok: false, detail: `no published artifact event for ${artifactId}` };
    }
    return { ok: true, value: event };
  });
}

async function waitForTokenTweakEvent(
  sessionId,
  sessionGroupId,
  tweakedArtifactId,
  parentArtifactId,
  expectedTokens,
) {
  return pollUntil("token tweak design artifact event", async () => {
    const data = await graphql(SESSION_EVENTS, {
      organizationId,
      sessionId,
      types: ["design_artifact_updated"],
    });
    const event = data.events?.find((candidate) => {
      if (candidate.eventType !== "design_artifact_updated") return false;
      const payload = candidate.payload;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
      const artifact = payload.artifact;
      return (
        artifact &&
        typeof artifact === "object" &&
        !Array.isArray(artifact) &&
        artifact.id === tweakedArtifactId &&
        payload.parentArtifactId === parentArtifactId &&
        payload.sessionGroupId === sessionGroupId
      );
    });
    if (!event) {
      return { ok: false, detail: `no token tweak event for ${tweakedArtifactId}` };
    }

    const payload = asPayload(event, "Token tweak event");
    const artifact = asObject(payload.artifact, "Token tweak event artifact");
    if (artifact.parentArtifactId !== parentArtifactId) {
      throw new Error(
        `Token tweak event parent is ${artifact.parentArtifactId ?? "missing"}, expected ${parentArtifactId}`,
      );
    }
    const tokens = asObject(payload.tokens, "Token tweak event tokens");
    for (const [key, value] of Object.entries(expectedTokens)) {
      if (tokens[key] !== value) {
        throw new Error(
          `Token tweak event token ${key} is ${tokens[key] ?? "missing"}, expected ${value}`,
        );
      }
    }
    const metadata = asObject(artifact.metadata, "Token tweak event artifact metadata");
    if (metadata.source !== "patchDesignArtifactTokens") {
      throw new Error(`Token tweak event source is ${metadata.source ?? "missing"}`);
    }
    const html = typeof artifact.html === "string" ? artifact.html : "";
    if (!html.includes("--trace-smoke-accent: #0f766e;")) {
      throw new Error("Token tweak event artifact HTML did not include patched CSS variable");
    }
    return { ok: true, value: event };
  });
}

async function waitForGeneratedArtifactCompletionEvents(sessionId, artifacts, label) {
  const artifactsById = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const artifactIds = artifacts.map((artifact) => artifact.id);
  return pollUntil(`${label} artifact completion events`, async () => {
    const data = await graphql(SESSION_EVENTS, {
      organizationId,
      sessionId,
      types: ["design_generation_started", "design_artifact_created", "session_output"],
    });
    const events = data.events ?? [];
    const missing = [];

    for (const artifactId of artifactIds) {
      const createdIndex = events.findIndex((event) => {
        if (event.eventType !== "design_artifact_created") return false;
        const payload = event.payload;
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
        const artifact = payload.artifact;
        return artifact && typeof artifact === "object" && artifact.id === artifactId;
      });
      const completedIndex = events.findIndex((event) => {
        if (event.eventType !== "session_output") return false;
        const payload = event.payload;
        return (
          payload &&
          typeof payload === "object" &&
          !Array.isArray(payload) &&
          payload.type === "design_generation_completed" &&
          payload.artifactId === artifactId
        );
      });
      if (createdIndex < 0 || completedIndex < 0) {
        const missingCreated = createdIndex < 0;
        const missingCompleted = completedIndex < 0;
        missing.push(
          `${artifactId}:${missingCreated ? "created" : ""}${missingCreated && missingCompleted ? "+" : ""}${missingCompleted ? "completed" : ""}`,
        );
        continue;
      }
      if (completedIndex <= createdIndex) {
        throw new Error(
          `${label} completion for ${artifactId} was emitted before the artifact creation event`,
        );
      }
      const completedPayload = asPayload(
        events[completedIndex],
        `${label} completion ${artifactId}`,
      );
      if (typeof completedPayload.generationId !== "string" || !completedPayload.generationId) {
        throw new Error(`${label} completion ${artifactId} is missing generationId`);
      }
      const generationId = completedPayload.generationId;
      const startedIndex = events.findIndex((event) => {
        if (event.eventType !== "design_generation_started") return false;
        const payload = event.payload;
        return (
          payload &&
          typeof payload === "object" &&
          !Array.isArray(payload) &&
          payload.generationId === generationId
        );
      });
      if (startedIndex < 0) {
        throw new Error(
          `${label} generation ${generationId} did not emit design_generation_started`,
        );
      }
      if (startedIndex >= createdIndex) {
        throw new Error(
          `${label} generation ${generationId} started after artifact creation was emitted`,
        );
      }
      const deltaIndex = events.findIndex((event) => {
        if (event.eventType !== "session_output") return false;
        const payload = event.payload;
        return (
          payload &&
          typeof payload === "object" &&
          !Array.isArray(payload) &&
          payload.type === "design_generation_delta" &&
          payload.generationId === generationId &&
          typeof payload.htmlPreview === "string"
        );
      });
      if (deltaIndex < 0) {
        throw new Error(`${label} generation ${generationId} did not emit streamed deltas`);
      }
      if (deltaIndex >= completedIndex) {
        throw new Error(`${label} generation ${generationId} delta arrived after completion`);
      }
      if (typeof completedPayload.model !== "string" || !completedPayload.model) {
        throw new Error(`${label} completion ${artifactId} is missing model`);
      }
      if (typeof completedPayload.htmlPreview !== "string" || !completedPayload.htmlPreview) {
        throw new Error(`${label} completion ${artifactId} is missing htmlPreview`);
      }
      const artifact = artifactsById.get(artifactId);
      const metadata = asObject(artifact?.metadata, `${label} artifact ${artifactId} metadata`);
      if (completedPayload.directionIndex !== metadata.directionIndex) {
        throw new Error(
          `${label} completion ${artifactId} directionIndex is ${completedPayload.directionIndex ?? "missing"}, expected ${metadata.directionIndex ?? "missing"}`,
        );
      }
      if (completedPayload.directionCount !== metadata.directionCount) {
        throw new Error(
          `${label} completion ${artifactId} directionCount is ${completedPayload.directionCount ?? "missing"}, expected ${metadata.directionCount ?? "missing"}`,
        );
      }
      if (completedPayload.directionLabel !== metadata.directionLabel) {
        throw new Error(
          `${label} completion ${artifactId} directionLabel is ${completedPayload.directionLabel ?? "missing"}, expected ${metadata.directionLabel ?? "missing"}`,
        );
      }
    }

    if (missing.length > 0) {
      return { ok: false, detail: `missing ${missing.join(", ")}` };
    }
    return { ok: true, value: events };
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

function assertDirectionMetadata(artifact, label, expectedIndex, expectedCount) {
  const metadata = asObject(artifact.metadata, `${label} metadata`);
  if (metadata.directionIndex !== expectedIndex) {
    throw new Error(
      `${label} directionIndex is ${metadata.directionIndex ?? "missing"}, expected ${expectedIndex}`,
    );
  }
  if (metadata.directionCount !== expectedCount) {
    throw new Error(
      `${label} directionCount is ${metadata.directionCount ?? "missing"}, expected ${expectedCount}`,
    );
  }
  if (typeof metadata.directionLabel !== "string" || !metadata.directionLabel.trim()) {
    throw new Error(`${label} directionLabel is ${metadata.directionLabel ?? "missing"}`);
  }
}

function assertUnpublishedArtifact(artifact, label) {
  if (artifact.publishedAt) {
    throw new Error(`${label} artifact ${artifact.id} was published before explicit publish`);
  }
  if (artifact.publicUrl) {
    throw new Error(`${label} artifact ${artifact.id} exposed publicUrl before explicit publish`);
  }
}

async function assertUrlRenders(url, label) {
  const response = await fetch(url, { redirect: "follow" });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}: ${body.slice(0, 500)}`);
  }
  assertDesignArtifactHeaders(response, label, { cacheControl: "public, max-age=60" });
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
  assertDesignArtifactHeaders(response, `${label} bootstrap`, { cacheControl: "no-store" });
  if (!body.includes("trace:artifact:render")) {
    throw new Error(`${label} bootstrap did not return the artifact bootstrap shell`);
  }
  if (body.includes(expectedText)) {
    throw new Error(`${label} bootstrap leaked published artifact content`);
  }
}

function assertDesignArtifactHeaders(response, label, { cacheControl }) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    throw new Error(`${label} content-type is ${contentType || "missing"}`);
  }

  const actualCacheControl = response.headers.get("cache-control");
  if (actualCacheControl !== cacheControl) {
    throw new Error(`${label} cache-control is ${actualCacheControl ?? "missing"}`);
  }

  const csp = response.headers.get("content-security-policy") ?? "";
  for (const directive of ["default-src 'self'", "frame-ancestors *", "base-uri 'none'"]) {
    if (!csp.includes(directive)) {
      throw new Error(`${label} CSP is missing ${directive}`);
    }
  }

  const expectedHeaders = {
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-embedder-policy": "credentialless",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  };
  for (const [name, expectedValue] of Object.entries(expectedHeaders)) {
    const actualValue = response.headers.get(name);
    if (actualValue !== expectedValue) {
      throw new Error(`${label} ${name} is ${actualValue ?? "missing"}`);
    }
  }
}

function assertPublishedArtifactUrl(url, artifactId) {
  const parsed = new URL(url);
  if (parsed.pathname !== "/") {
    throw new Error(`Published artifact URL path is ${parsed.pathname}`);
  }
  const hostname = parsed.hostname.toLowerCase();
  if (!hostname.startsWith(`${artifactId.toLowerCase()}.`)) {
    throw new Error(`Published artifact URL host ${hostname} is not scoped to ${artifactId}`);
  }
  if (hostname === new URL(serverUrl).hostname.toLowerCase()) {
    throw new Error("Published artifact URL used the Trace app host");
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
if (session.hosting !== "serverless") {
  throw new Error(`Design session hosting is ${session.hosting ?? "missing"}`);
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
assertUnpublishedArtifact(initialArtifacts[0], "Initial");
await waitForGeneratedArtifactCompletionEvents(session.id, [initialArtifacts[0]], "Initial");

const generatedData = await graphql(GENERATE_DESIGN_ARTIFACTS, {
  sessionGroupId: session.sessionGroupId,
  prompt,
  directionCount: 3,
});
const generatedArtifacts = generatedData.generateDesignArtifacts ?? [];
if (generatedArtifacts.length !== 3) {
  throw new Error(`Expected 3 generated directions, got ${generatedArtifacts.length}`);
}
const directionIndexes = new Set();
const directionLabels = new Set();
for (const [index, artifact] of generatedArtifacts.entries()) {
  if (artifact.parentArtifactId !== null) {
    throw new Error(`Generated direction ${artifact.id} unexpectedly has a parent artifact`);
  }
  assertArtifactHtml(artifact, "Generated direction");
  assertLlmArtifactMetadata(artifact, "Generated direction", "generateDesignArtifacts");
  assertDirectionMetadata(artifact, "Generated direction", index, generatedArtifacts.length);
  directionIndexes.add(artifact.metadata.directionIndex);
  directionLabels.add(artifact.metadata.directionLabel);
  assertUnpublishedArtifact(artifact, "Generated direction");
}
if (directionIndexes.size !== generatedArtifacts.length) {
  throw new Error("Generated directions did not preserve unique direction indexes");
}
if (directionLabels.size !== generatedArtifacts.length) {
  throw new Error("Generated directions did not preserve unique direction labels");
}
await waitForGeneratedArtifactCompletionEvents(
  session.id,
  generatedArtifacts,
  "Generated direction",
);
const usage = await waitForDesignUsage(session.id);

const selected = generatedArtifacts[0];
const commentBounds = { left: 24, top: 32, width: 480, height: 160, x: 0.1, y: 0.15 };
const commentData = await graphql(COMMENT_DESIGN_ARTIFACT, {
  artifactId: selected.id,
  body: "Smoke comment pinned to the hero",
  anchor: { type: "element", dataEl: "hero", text: expectedText, bounds: commentBounds },
  sendToAgent: true,
});
if (commentData.commentDesignArtifact.eventType !== "design_comment_added") {
  throw new Error(`Unexpected comment event ${commentData.commentDesignArtifact.eventType}`);
}
const commentPayload = asPayload(commentData.commentDesignArtifact, "Comment");
if (commentPayload.artifactId !== selected.id) {
  throw new Error(`Comment artifact id is ${commentPayload.artifactId ?? "missing"}`);
}
if (commentPayload.body !== "Smoke comment pinned to the hero") {
  throw new Error("Comment body was not preserved in the event payload");
}
if (commentPayload.sendToAgent !== true) {
  throw new Error("Comment sendToAgent flag was not preserved in the event payload");
}
const commentAnchor = asObject(commentPayload.anchor, "Comment anchor");
if (
  commentAnchor.type !== "element" ||
  commentAnchor.dataEl !== "hero" ||
  commentAnchor.text !== expectedText
) {
  throw new Error("Comment element anchor was not preserved in the event payload");
}
const preservedBounds = asObject(commentAnchor.bounds, "Comment anchor bounds");
for (const key of ["left", "top", "width", "height", "x", "y"]) {
  if (preservedBounds[key] !== commentBounds[key]) {
    throw new Error(`Comment anchor bound ${key} is ${preservedBounds[key] ?? "missing"}`);
  }
}
const commentIteration = await waitForChildArtifact(
  session.sessionGroupId,
  selected.id,
  "comment-driven iteration",
);
assertArtifactHtml(commentIteration, "Comment-driven iteration");
assertUnpublishedArtifact(commentIteration, "Comment-driven iteration");
await waitForGeneratedArtifactCompletionEvents(
  session.id,
  [commentIteration],
  "Comment-driven iteration",
);

const tweakData = await graphql(PATCH_DESIGN_ARTIFACT_TOKENS, {
  artifactId: selected.id,
  tokens: { "--trace-smoke-accent": "#0f766e" },
});
const tweaked = tweakData.patchDesignArtifactTokens;
if (tweaked.parentArtifactId !== selected.id) {
  throw new Error("Token tweak did not create a child artifact version");
}
assertArtifactHtml(tweaked, "Tweaked");
assertUnpublishedArtifact(tweaked, "Tweaked");
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
await waitForTokenTweakEvent(session.id, session.sessionGroupId, tweaked.id, selected.id, {
  "--trace-smoke-accent": "#0f766e",
});

const pageOptions = {
  widthPx: 1440,
  heightPx: 1080,
  marginTopPx: 0,
  marginRightPx: 12,
  marginBottomPx: 24,
  marginLeftPx: 12,
};
const exportData = await graphql(EXPORT_DESIGN_ARTIFACT_PDF, {
  artifactId: tweaked.id,
  pageOptions,
});
if (exportData.exportDesignArtifactPdf.eventType !== "design_export_completed") {
  throw new Error(`Unexpected export event ${exportData.exportDesignArtifactPdf.eventType}`);
}
const exportPayload = asPayload(exportData.exportDesignArtifactPdf, "Export");
if (exportPayload.artifactId !== tweaked.id) {
  throw new Error(`PDF export artifact id is ${exportPayload.artifactId ?? "missing"}`);
}
if (exportPayload.sessionGroupId !== session.sessionGroupId) {
  throw new Error(`PDF export session group is ${exportPayload.sessionGroupId ?? "missing"}`);
}
if (exportPayload.exportType !== "pdf") {
  throw new Error(`PDF export type is ${exportPayload.exportType ?? "missing"}`);
}
if (exportPayload.status !== "completed") {
  throw new Error(`PDF export status is ${exportPayload.status ?? "missing"}`);
}
if (typeof exportPayload.fileName !== "string" || !exportPayload.fileName.endsWith(".pdf")) {
  throw new Error(`PDF export fileName is ${exportPayload.fileName ?? "missing"}`);
}
if (typeof exportPayload.fileId !== "string" || !exportPayload.fileId.startsWith("uploads/")) {
  throw new Error(`PDF export fileId is ${exportPayload.fileId ?? "missing"}`);
}
const exportPageOptions = asObject(exportPayload.pageOptions, "PDF export page options");
for (const key of Object.keys(pageOptions)) {
  if (exportPageOptions[key] !== pageOptions[key]) {
    throw new Error(`PDF export page option ${key} is ${exportPageOptions[key] ?? "missing"}`);
  }
}
if (typeof exportPayload.fileUrl !== "string" || !exportPayload.fileUrl.trim()) {
  throw new Error("PDF export fileUrl is missing");
}
if (typeof exportPayload.byteSize !== "number" || exportPayload.byteSize <= 0) {
  throw new Error("PDF export byteSize is missing or empty");
}
if (
  exportPayload.pageCount !== undefined &&
  (typeof exportPayload.pageCount !== "number" || exportPayload.pageCount <= 0)
) {
  throw new Error(`PDF export pageCount is ${exportPayload.pageCount}`);
}
await waitForPdfExportTimelineEvents(session.id, tweaked.id, exportPayload);
await assertPdfDownload(exportPayload.fileUrl, "PDF export URL");

const publishData = await graphql(PUBLISH_DESIGN_ARTIFACT, { artifactId: tweaked.id });
const published = publishData.publishDesignArtifact;
if (!published.publishedAt) throw new Error("Published artifact is missing publishedAt");
if (!published.publicUrl) throw new Error("Published artifact publicUrl is missing");
assertArtifactHtml(published, "Published");
assertPublishedArtifactUrl(published.publicUrl, tweaked.id);
await waitForPublishedArtifactEvent(session.id, tweaked.id, published.publicUrl);
await assertUrlRenders(published.publicUrl, "published design artifact URL");
await assertBootstrapDoesNotLeakContent(published.publicUrl, "published design artifact URL");

const promoteData = await graphql(PROMOTE_DESIGN_ARTIFACT, {
  artifactId: tweaked.id,
  prompt: "Implement the smoke-verified design artifact.",
  referenceArtifactIds: [generatedArtifacts[1].id],
});
const promoted = promoteData.promoteDesignArtifactToCodingSession;
if (promoted.sessionGroup?.kind !== "coding") {
  throw new Error(`Promoted group kind is ${promoted.sessionGroup?.kind ?? "missing"}`);
}
if (promoted.sessionGroup?.forkedFromSessionGroupId !== session.sessionGroupId) {
  throw new Error("Promoted coding session is not linked to the source design group");
}
const promotedBrief = await waitForPromotedBrief(promoted.id);
if (!promotedBrief.includes("Implement the smoke-verified design artifact.")) {
  throw new Error("Promoted coding session brief did not include the implementation prompt");
}
if (!promotedBrief.includes(expectedText) || !promotedBrief.includes("--trace-smoke-accent")) {
  throw new Error("Promoted coding session brief did not include the selected artifact HTML");
}
if (!promotedBrief.includes("Reference artifact 2")) {
  throw new Error("Promoted coding session brief did not include the secondary reference artifact");
}
await waitForPromotionEvent(session.id, tweaked.id, [generatedArtifacts[1].id], promoted);

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
