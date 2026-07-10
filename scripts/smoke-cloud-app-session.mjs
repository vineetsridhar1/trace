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
    "Start the preinstalled Redis server and use it from the app for a small cache or health check.",
    "Use the existing app starter, keep the app runnable on port 3000, and create a checkpoint when done.",
  ].join(" ");
const expectedText = process.env.TRACE_SMOKE_EXPECTED_TEXT ?? "TRACE_SMOKE_APP_READY";
const timeoutMs = readDurationEnv("TRACE_SMOKE_TIMEOUT_MS", 20 * 60 * 1000);
const pollMs = readDurationEnv("TRACE_SMOKE_POLL_MS", 5000);
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

const CREATE_TERMINAL = `
  mutation SmokeCreateTerminal($sessionId: ID!, $cols: Int!, $rows: Int!) {
    createTerminal(sessionId: $sessionId, cols: $cols, rows: $rows) {
      id
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

const DISABLE_ENDPOINT = `
  mutation SmokeDisableEndpoint($endpointId: ID!) {
    disableSessionEndpointForwarding(endpointId: $endpointId) {
      id
      status
    }
  }
`;

const ARCHIVE_SESSION_GROUP = `
  mutation SmokeArchiveSessionGroup($id: ID!) {
    archiveSessionGroup(id: $id) {
      id
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
    let result;
    try {
      result = await fn();
    } catch (error) {
      // Transient network errors / 5xx during the long poll are non-terminal:
      // record and retry rather than aborting the whole run.
      result = { ok: false, detail: `transient error: ${error.message}` };
    }
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

async function waitForReadyApp(sessionGroupId, label) {
  return pollUntil(`${label} app runtime, endpoint, logs, and checkpoint`, async () => {
    const state = await appState(sessionGroupId);
    const group = state.sessionGroup;
    if (!group) return { ok: false, detail: "session group not found" };
    if (group.kind !== "app") return { ok: false, detail: `group kind is ${group.kind}` };

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

    const checkpoints = group.gitCheckpoints;
    if (checkpoints.length === 0) return { ok: false, detail: "no checkpoint recorded yet" };
    const checkpoint = checkpoints[0];
    if (requireCapture && checkpoint.captureStatus !== "captured") {
      return {
        ok: false,
        detail: `checkpoint capture is ${checkpoint.captureStatus ?? "missing"}`,
      };
    }
    if (requireCapture && !checkpoint.captureUrl) {
      return { ok: false, detail: "checkpoint capture URL is missing" };
    }
    return { ok: true, value: { state, process, endpoint, checkpoint } };
  });
}

async function renderUrl(url, label, options = {}) {
  const requireFetch = options.requireFetch !== false;
  if (requireFetch) {
    // The starter is a Vite/React app, so the marker is client-rendered and
    // will not appear in the raw HTML. Assert on status only here; the
    // headless-Chrome DOM check below verifies the rendered content.
    const response = await fetch(url, { redirect: "follow" });
    const html = await response.text();
    if (!response.ok) {
      throw new Error(`${label} returned HTTP ${response.status}: ${html.slice(0, 500)}`);
    }
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
  } finally {
    await fsp.rm(profileDir, { recursive: true, force: true });
  }
}

async function publishApp(sessionGroupId) {
  const data = await graphql(PUBLISH_APP, { sessionGroupId });
  const endpoint = data.publishAppSession;
  if (endpoint.accessMode !== "public") {
    throw new Error(`Published endpoint access mode is ${endpoint.accessMode}`);
  }
  if (!endpoint.url) throw new Error("Published endpoint URL is missing");
  return { id: endpoint.id, url: endpoint.url };
}

async function createPreviewUrl(endpointId) {
  const data = await graphql(CREATE_PREVIEW, { endpointId });
  return data.createSessionEndpointPreview.url;
}

async function verifyRuntimeTerminal(sessionId, { requireRedis = false } = {}) {
  const data = await graphql(CREATE_TERMINAL, { sessionId, cols: 100, rows: 30 });
  const terminalId = data.createTerminal.id;
  const terminalUrl = new URL(serverUrl);
  terminalUrl.protocol = terminalUrl.protocol === "https:" ? "wss:" : "ws:";
  terminalUrl.pathname = "/terminal";
  terminalUrl.search = new URLSearchParams({ token: authToken }).toString();

  await new Promise((resolve, reject) => {
    const socket = new WebSocket(terminalUrl);
    let output = "";
    let finished = false;
    const timer = setTimeout(
      () => finish(new Error("Timed out verifying app runtime terminal")),
      30_000,
    );

    function finish(error) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      socket.close();
      if (error) reject(error);
      else resolve();
    }

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "attach", terminalId }));
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.type === "ready") {
        const checks = ["test -f .trace/app-starter.json"];
        if (requireRedis) checks.push('test "$(redis-cli ping)" = PONG');
        socket.send(
          JSON.stringify({
            type: "input",
            data: `${checks.join(" && ")} && printf "TRACE_SMOKE_TERMINAL_READY:%s\\n" "$PWD"; exit $?\n`,
          }),
        );
      } else if (message.type === "output") {
        output += message.data;
      } else if (message.type === "error") {
        finish(new Error(`Terminal verification failed: ${message.message}`));
      } else if (message.type === "exit") {
        if (message.exitCode !== 0) {
          finish(new Error(`Terminal command exited ${message.exitCode}: ${output.slice(-1000)}`));
        } else if (!output.includes("TRACE_SMOKE_TERMINAL_READY:")) {
          finish(
            new Error(`Terminal output was missing the workdir marker: ${output.slice(-1000)}`),
          );
        } else {
          finish();
        }
      }
    });
    socket.addEventListener("error", () => finish(new Error("Terminal WebSocket failed")));
    socket.addEventListener("close", () => {
      if (!finished) finish(new Error(`Terminal WebSocket closed early: ${output.slice(-1000)}`));
    });
  });
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

const keepResources = process.env.TRACE_SMOKE_KEEP === "1";

// Resources the script creates; tracked before the try so the finally block can
// tear them down regardless of where the flow fails.
const createdSessionGroupIds = [];
const publishedEndpointIds = [];

async function teardown() {
  if (keepResources) {
    process.stdout.write("TRACE_SMOKE_KEEP=1 — leaving created resources in place for debugging.\n");
    return;
  }
  for (const endpointId of publishedEndpointIds) {
    try {
      await graphql(DISABLE_ENDPOINT, { endpointId });
    } catch (error) {
      process.stdout.write(`Teardown: failed to disable endpoint ${endpointId}: ${error.message}\n`);
    }
  }
  for (const groupId of createdSessionGroupIds) {
    try {
      await graphql(ARCHIVE_SESSION_GROUP, { id: groupId });
    } catch (error) {
      process.stdout.write(`Teardown: failed to archive session group ${groupId}: ${error.message}\n`);
    }
  }
}

try {
  process.stdout.write("Starting fresh cloud app session smoke...\n");
  const session = await startAppSession({
    kind: "app",
    prompt,
    ...(process.env.TRACE_SMOKE_MODEL ? { model: process.env.TRACE_SMOKE_MODEL } : {}),
    ...(process.env.TRACE_SMOKE_TOOL ? { tool: process.env.TRACE_SMOKE_TOOL } : {}),
    ...(process.env.TRACE_SMOKE_ENVIRONMENT_ID
      ? { environmentId: process.env.TRACE_SMOKE_ENVIRONMENT_ID }
      : {}),
  });
  createdSessionGroupIds.push(session.sessionGroupId);

  const initial = await waitForReadyApp(session.sessionGroupId, "initial");
  await verifyRuntimeTerminal(session.id, { requireRedis: true });
  const previewUrl = await createPreviewUrl(initial.endpoint.id);
  await renderUrl(previewUrl, "private preview URL", { requireFetch: false });
  const published = await publishApp(session.sessionGroupId);
  publishedEndpointIds.push(published.id);
  await renderUrl(published.url, "published public URL");

  // Checkpoint revert/resume is currently out of scope for app-session QA.
  // TRACE_SMOKE_SKIP_RESTORE=1 skips the restore leg (loudly); leave it unset to
  // exercise the full flow once restore lineage is back in scope.
  const skipRestore = process.env.TRACE_SMOKE_SKIP_RESTORE === "1";
  let restored = null;
  if (skipRestore) {
    process.stdout.write(
      "SKIPPED: restore leg (TRACE_SMOKE_SKIP_RESTORE=1) — checkpoint restore is NOT verified by this run.\n",
    );
  } else {
    restored = await startAppSession({
      restoreCheckpointId: initial.checkpoint.id,
      ...(process.env.TRACE_SMOKE_MODEL ? { model: process.env.TRACE_SMOKE_MODEL } : {}),
      ...(process.env.TRACE_SMOKE_TOOL ? { tool: process.env.TRACE_SMOKE_TOOL } : {}),
    });
    createdSessionGroupIds.push(restored.sessionGroupId);
    const restoredReady = await waitForReadyApp(restored.sessionGroupId, "restored");
    await verifyRuntimeTerminal(restored.id);
    const restoredPreviewUrl = await createPreviewUrl(restoredReady.endpoint.id);
    await renderUrl(restoredPreviewUrl, "restored private preview URL", { requireFetch: false });
    const restoredPublished = await publishApp(restored.sessionGroupId);
    publishedEndpointIds.push(restoredPublished.id);
    await renderUrl(restoredPublished.url, "restored public URL");
  }

  process.stdout.write(
    [
      "Trace cloud app session smoke passed.",
      `Initial session: ${session.id}`,
      `Initial group: ${session.sessionGroupId}`,
      `Checkpoint: ${initial.checkpoint.id} ${initial.checkpoint.commitSha}`,
      `Published URL: ${published.url}`,
      ...(restored
        ? [`Restored session: ${restored.id}`, `Restored group: ${restored.sessionGroupId}`]
        : ["Restore leg: SKIPPED"]),
    ].join("\n") + "\n",
  );
} finally {
  await teardown();
}
