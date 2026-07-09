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
  process.env.TRACE_SMOKE_APP_PROMPT ??
  [
    "Build a lightweight CRM approval tracker app.",
    "Keep the exact text TRACE_SMOKE_APP_READY visible on the home page.",
    "Use the existing app starter, keep the app runnable on port 3000, and create a checkpoint when done.",
  ].join(" ");
const expectedText = process.env.TRACE_SMOKE_EXPECTED_TEXT ?? "TRACE_SMOKE_APP_READY";
const timeoutMs = readDurationEnv("TRACE_SMOKE_TIMEOUT_MS", 20 * 60 * 1000);
const pollMs = readDurationEnv("TRACE_SMOKE_POLL_MS", 5000);
const terminalTimeoutMs = readDurationEnv("TRACE_SMOKE_TERMINAL_TIMEOUT_MS", 60 * 1000);
const requireCapture = process.env.TRACE_SMOKE_REQUIRE_CAPTURE !== "0";
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

const START_APP_SESSION = `
  mutation SmokeStartAppSession($input: StartSessionInput!) {
    startSession(input: $input) {
      id
      sessionGroupId
      hosting
      sessionGroup {
        id
        kind
        repo {
          id
          provider
        }
      }
    }
  }
`;

const APP_STATE = `
  query SmokeAppState($sessionGroupId: ID!) {
    sessionGroup(id: $sessionGroupId) {
      id
      kind
      repo {
        id
        provider
        remoteUrl
      }
      sessions {
        id
        hosting
        agentStatus
        sessionStatus
      }
      gitCheckpoints {
        id
        commitSha
        subject
        captureStatus
        captureUrl
        capturedAt
        createdAt
      }
    }
    sessionApplicationProcesses(sessionGroupId: $sessionGroupId) {
      id
      label
      status
      runtimeInstanceId
      lastError
    }
    sessionEndpoints(sessionGroupId: $sessionGroupId) {
      id
      url
      label
      status
      accessMode
      targetPort
    }
  }
`;

const PROCESS_LOGS = `
  query SmokeProcessLogs($processId: ID!, $limit: Int) {
    sessionApplicationLogs(processId: $processId, limit: $limit) {
      id
      stream
      data
      sequence
      timestamp
    }
  }
`;

const CREATE_PREVIEW = `
  mutation SmokeCreatePreview($endpointId: ID!) {
    createSessionEndpointPreview(endpointId: $endpointId) {
      url
      expiresAt
    }
  }
`;

const PUBLISH_APP = `
  mutation SmokePublishApp($sessionGroupId: ID!) {
    publishAppSession(sessionGroupId: $sessionGroupId) {
      id
      url
      accessMode
      status
    }
  }
`;

const CREATE_TERMINAL = `
  mutation SmokeCreateTerminal($sessionId: ID!, $cols: Int!, $rows: Int!) {
    createTerminal(sessionId: $sessionId, cols: $cols, rows: $rows) {
      id
      sessionId
    }
  }
`;

const DESTROY_TERMINAL = `
  mutation SmokeDestroyTerminal($terminalId: ID!) {
    destroyTerminal(terminalId: $terminalId)
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

function enabledEndpoint(state) {
  return (
    state.sessionEndpoints.find((endpoint) => endpoint.status === "enabled" && endpoint.url) ?? null
  );
}

function runningProcess(state) {
  return state.sessionApplicationProcesses.find((process) => process.status === "running") ?? null;
}

async function appState(sessionGroupId) {
  return graphql(APP_STATE, { sessionGroupId });
}

async function waitForReadyApp(sessionGroupId, label, options = {}) {
  const requireCheckpoint = options.requireCheckpoint !== false;
  const requireManagedRepo = options.requireManagedRepo !== false;
  const readinessLabel = requireCheckpoint
    ? `${label} app runtime, endpoint, logs, and checkpoint`
    : `${label} app runtime, endpoint, and logs`;
  return pollUntil(readinessLabel, async () => {
    const state = await appState(sessionGroupId);
    const group = state.sessionGroup;
    if (!group) return { ok: false, detail: "session group not found" };
    if (group.kind !== "app") return { ok: false, detail: `group kind is ${group.kind}` };
    if (requireManagedRepo && group.repo?.provider !== "managed") {
      return {
        ok: false,
        detail: `repo provider is ${group.repo?.provider ?? "missing"}`,
      };
    }

    const process = runningProcess(state);
    const endpoint = enabledEndpoint(state);
    if (!process) {
      const statuses = state.sessionApplicationProcesses.map(
        (item) => `${item.label}:${item.status}`,
      );
      return { ok: false, detail: `no running process (${statuses.join(", ") || "none"})` };
    }
    if (!endpoint) {
      const statuses = state.sessionEndpoints.map((item) => `${item.label}:${item.status}`);
      return { ok: false, detail: `no enabled endpoint (${statuses.join(", ") || "none"})` };
    }

    const logs = await graphql(PROCESS_LOGS, { processId: process.id, limit: 20 });
    if (logs.sessionApplicationLogs.length === 0) {
      return { ok: false, detail: `no logs for process ${process.id}` };
    }

    let checkpoint = null;
    if (requireCheckpoint) {
      const checkpoints = group.gitCheckpoints;
      if (checkpoints.length === 0) return { ok: false, detail: "no checkpoint recorded yet" };
      checkpoint = checkpoints[0];
      if (!checkpoint.commitSha) return { ok: false, detail: "checkpoint commit SHA is missing" };
      if (requireCapture && checkpoint.captureStatus !== "captured") {
        return {
          ok: false,
          detail: `checkpoint capture is ${checkpoint.captureStatus ?? "missing"}`,
        };
      }
      if (requireCapture && !checkpoint.captureUrl) {
        return { ok: false, detail: "checkpoint capture URL is missing" };
      }
    }

    return { ok: true, value: { state, process, endpoint, checkpoint } };
  });
}

async function renderUrl(url, label, options = {}) {
  const requireFetch = options.requireFetch !== false;
  const expectOverlay = options.expectOverlay === true;
  if (requireFetch) {
    const response = await fetch(url, { redirect: "follow" });
    const html = await response.text();
    if (!response.ok) {
      throw new Error(`${label} returned HTTP ${response.status}: ${html.slice(0, 500)}`);
    }
    if (!html.includes(expectedText)) {
      throw new Error(`${label} fetch did not contain ${expectedText}`);
    }
    assertOverlayState(html, label, expectOverlay);
  }

  if (skipBrowser) {
    if (!requireFetch) {
      throw new Error(`${label} requires browser verification; unset TRACE_SMOKE_SKIP_BROWSER`);
    }
    return;
  }

  const profileDir = await fsp.mkdtemp(path.join(os.tmpdir(), "trace-cloud-app-smoke-"));
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
    assertOverlayState(stdout, `${label} browser DOM`, expectOverlay);
  } finally {
    await fsp.rm(profileDir, { recursive: true, force: true });
  }
}

function assertOverlayState(html, label, expected) {
  const hasOverlay = html.includes("data-trace-app-overlay");
  if (expected && !hasOverlay) {
    throw new Error(`${label} did not include the authoring overlay`);
  }
  if (!expected && hasOverlay) {
    throw new Error(`${label} unexpectedly included the authoring overlay`);
  }
}

async function assertImageDownload(url, label) {
  const response = await fetch(url, { redirect: "follow" });
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}`);
  }
  if (bytes.byteLength === 0) {
    throw new Error(`${label} returned an empty file`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!contentType.startsWith("image/") && !png && !jpeg) {
    throw new Error(`${label} did not return image bytes`);
  }
}

async function createPreviewUrl(endpointId) {
  const data = await graphql(CREATE_PREVIEW, { endpointId });
  return data.createSessionEndpointPreview.url;
}

async function publishApp(sessionGroupId) {
  const data = await graphql(PUBLISH_APP, { sessionGroupId });
  const endpoint = data.publishAppSession;
  if (endpoint.accessMode !== "public") {
    throw new Error(`Published endpoint access mode is ${endpoint.accessMode}`);
  }
  if (!endpoint.url) throw new Error("Published endpoint URL is missing");
  return endpoint.url;
}

function terminalWebSocketUrl() {
  const url = new URL(serverUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/terminal";
  url.search = "";
  url.searchParams.set("token", authToken);
  return url.toString();
}

function websocketMessageText(data) {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  }
  return String(data);
}

async function verifyTerminalWorkdir(sessionId) {
  if (typeof WebSocket !== "function") {
    throw new Error("Global WebSocket support is required for the terminal smoke");
  }

  const createData = await graphql(CREATE_TERMINAL, { sessionId, cols: 80, rows: 24 });
  const terminalId = createData.createTerminal?.id;
  if (!terminalId) throw new Error("createTerminal did not return a terminal id");

  let ws = null;
  try {
    const marker = "TRACE_SMOKE_TERMINAL_READY:";
    const command = [
      "node -e",
      `"const p=require('./package.json'); if (!p.scripts || !p.scripts.dev) process.exit(2); process.stdout.write('${marker}'+process.cwd()+':package-json-ok\\\\n')"`,
    ].join(" ");

    return await new Promise((resolve, reject) => {
      let settled = false;
      let output = "";
      const timer = setTimeout(() => {
        fail(new Error(`Terminal command timed out after ${terminalTimeoutMs}ms`));
      }, terminalTimeoutMs);

      function cleanup() {
        clearTimeout(timer);
      }

      function fail(error) {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      }

      function pass(value) {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      }

      ws = new WebSocket(terminalWebSocketUrl());
      ws.addEventListener("open", () => {
        ws.send(JSON.stringify({ type: "attach", terminalId }));
      });
      ws.addEventListener("error", () => {
        fail(new Error("Terminal WebSocket failed"));
      });
      ws.addEventListener("close", (event) => {
        if (!settled) {
          fail(new Error(`Terminal WebSocket closed before verification (${event.code})`));
        }
      });
      ws.addEventListener("message", (event) => {
        let message;
        try {
          message = JSON.parse(websocketMessageText(event.data));
        } catch {
          return;
        }
        if (message.type === "error") {
          fail(new Error(`Terminal error: ${message.message ?? "unknown"}`));
          return;
        }
        if (message.type === "ready") {
          ws.send(JSON.stringify({ type: "input", data: `${command}\n` }));
          return;
        }
        if (message.type !== "output" || typeof message.data !== "string") return;

        output += message.data;
        if (output.includes(marker) && output.includes(":package-json-ok")) {
          pass(output);
        }
      });
    });
  } finally {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close();
    }
    await graphql(DESTROY_TERMINAL, { terminalId }).catch((error) => {
      process.stderr.write(`Failed to destroy terminal ${terminalId}: ${error.message}\n`);
    });
  }
}

async function startAppSession(input) {
  const data = await graphql(START_APP_SESSION, { input });
  const session = data.startSession;
  if (session.hosting !== "cloud")
    throw new Error(`Started app session hosting is ${session.hosting}`);
  if (session.sessionGroup?.kind !== "app") {
    throw new Error(`Started group kind is ${session.sessionGroup?.kind ?? "missing"}`);
  }
  return session;
}

process.stdout.write("Starting fresh cloud app session smoke...\n");
const session = await startAppSession({
  kind: "app",
  prompt,
  ...(process.env.TRACE_SMOKE_MODEL ? { model: process.env.TRACE_SMOKE_MODEL } : {}),
  ...(process.env.TRACE_SMOKE_TOOL ? { tool: process.env.TRACE_SMOKE_TOOL } : {}),
  ...(process.env.TRACE_SMOKE_ENVIRONMENT_ID
    ? { environmentId: process.env.TRACE_SMOKE_ENVIRONMENT_ID }
    : {}),
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
});
if (session.sessionGroup?.repo) {
  throw new Error("Fresh app sessions must start without a repo before the first checkpoint");
}

const initial = await waitForReadyApp(session.sessionGroupId, "initial");
const managedRepoId = initial.state.sessionGroup.repo?.id;
if (!managedRepoId) {
  throw new Error("Initial app group did not link a managed repo after first checkpoint");
}
if (requireCapture) {
  await assertImageDownload(initial.checkpoint.captureUrl, "checkpoint capture URL");
}
const terminalOutput = await verifyTerminalWorkdir(session.id);
const previewUrl = await createPreviewUrl(initial.endpoint.id);
await renderUrl(previewUrl, "private preview URL", { requireFetch: false, expectOverlay: true });

const publicUrl = await publishApp(session.sessionGroupId);
await renderUrl(publicUrl, "published public URL", { expectOverlay: false });

const restored = await startAppSession({
  restoreCheckpointId: initial.checkpoint.id,
  ...(process.env.TRACE_SMOKE_MODEL ? { model: process.env.TRACE_SMOKE_MODEL } : {}),
  ...(process.env.TRACE_SMOKE_TOOL ? { tool: process.env.TRACE_SMOKE_TOOL } : {}),
});
if (restored.sessionGroupId === session.sessionGroupId) {
  throw new Error("Checkpoint restore reused the source app session group");
}
const restoredReady = await waitForReadyApp(restored.sessionGroupId, "restored", {
  requireCheckpoint: false,
  requireManagedRepo: true,
});
if (restoredReady.state.sessionGroup.repo?.id !== managedRepoId) {
  throw new Error("Restored app group did not use the source managed repo");
}
const restoredPreviewUrl = await createPreviewUrl(restoredReady.endpoint.id);
await renderUrl(restoredPreviewUrl, "restored preview URL", {
  requireFetch: false,
  expectOverlay: true,
});

process.stdout.write(
  [
    "Trace cloud app session smoke passed.",
    `Initial session: ${session.id}`,
    `Initial group: ${session.sessionGroupId}`,
    `Checkpoint: ${initial.checkpoint.id} ${initial.checkpoint.commitSha}`,
    `Terminal: ${terminalOutput.match(/TRACE_SMOKE_TERMINAL_READY:[^\r\n]+/)?.[0] ?? "verified"}`,
    `Published URL: ${publicUrl}`,
    `Restored session: ${restored.id}`,
    `Restored group: ${restored.sessionGroupId}`,
  ].join("\n") + "\n",
);
