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
const marker = process.env.TRACE_SMOKE_EXPECTED_TEXT ?? "TRACE_SMOKE_DESIGN_READY";
const timeoutMs = duration("TRACE_SMOKE_TIMEOUT_MS", 30 * 60 * 1000);
const pollMs = duration("TRACE_SMOKE_POLL_MS", 5000);
const keepResources = process.env.TRACE_SMOKE_KEEP === "1";
const chromeExecutable = [
  process.env.TRACE_CHROMIUM_EXECUTABLE,
  process.env.CHROMIUM_EXECUTABLE_PATH,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]
  .filter(Boolean)
  .find((candidate) => fs.existsSync(candidate));

if (!chromeExecutable) {
  throw new Error("Chrome/Chromium is required for design canvas and offline export verification");
}

const START_DESIGN = `
  mutation SmokeStartDesign($input: StartSessionInput!) {
    startSession(input: $input) {
      id sessionGroupId hosting
      sessionGroup { id kind repo { id provider remoteUrl } }
    }
  }
`;

const DESIGN_STATE = `
  query SmokeDesignState($sessionGroupId: ID!) {
    sessionGroup(id: $sessionGroupId) {
      id kind workdir repo { id provider remoteUrl }
      sessions { id hosting agentStatus sessionStatus workdir }
    }
    sessionApplicationProcesses(sessionGroupId: $sessionGroupId) {
      id status runtimeInstanceId lastError
    }
    sessionEndpoints(sessionGroupId: $sessionGroupId) {
      id url status accessMode targetPort
    }
  }
`;

const SEND_MESSAGE = `
  mutation SmokeSendDesignMessage($sessionId: ID!, $text: String!) {
    sendSessionMessage(sessionId: $sessionId, text: $text) { id }
  }
`;

const CREATE_PREVIEW = `
  mutation SmokeCreateDesignPreview($endpointId: ID!) {
    createSessionEndpointPreview(endpointId: $endpointId) { url expiresAt }
  }
`;

const ARCHIVE_GROUP = `
  mutation SmokeArchiveDesign($id: ID!) { archiveSessionGroup(id: $id) { id } }
`;

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function duration(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be positive`);
  return parsed;
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function poll(label, check) {
  const deadline = Date.now() + timeoutMs;
  let detail = "not checked";
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result.ok) return result.value;
      detail = result.detail;
    } catch (error) {
      detail = error.message;
    }
    process.stdout.write(`Waiting for ${label}: ${detail}\n`);
    await sleep(pollMs);
  }
  throw new Error(`Timed out waiting for ${label}: ${detail}`);
}

async function state(groupId) {
  return graphql(DESIGN_STATE, { sessionGroupId: groupId });
}

async function waitForAgent(groupId, expectedStatus = "done") {
  return poll(`design agent status ${expectedStatus}`, async () => {
    const current = await state(groupId);
    const session = current.sessionGroup?.sessions?.[0];
    if (!session) return { ok: false, detail: "session missing" };
    return session.sessionStatus === expectedStatus || session.agentStatus === expectedStatus
      ? { ok: true, value: current }
      : {
          ok: false,
          detail: `agent=${session.agentStatus} session=${session.sessionStatus}`,
        };
  });
}

async function waitForReadyRuntime(groupId) {
  return poll("one design workspace, process, and endpoint", async () => {
    const current = await state(groupId);
    const group = current.sessionGroup;
    if (!group) return { ok: false, detail: "group missing" };
    if (group.kind !== "design") return { ok: false, detail: `kind=${group.kind}` };
    if (!group.repo || group.repo.provider !== "managed") {
      return { ok: false, detail: `managed repo missing (${group.repo?.provider ?? "none"})` };
    }
    if (group.sessions.length !== 1 || !group.workdir || !group.sessions[0]?.workdir) {
      return { ok: false, detail: `workspace/session count=${group.sessions.length}` };
    }
    const processes = current.sessionApplicationProcesses;
    const endpoints = current.sessionEndpoints;
    if (processes.length !== 1 || processes[0].status !== "running") {
      return { ok: false, detail: `processes=${processes.map((item) => item.status).join(",")}` };
    }
    if (endpoints.length !== 1 || endpoints[0].status !== "enabled") {
      return { ok: false, detail: `endpoints=${endpoints.map((item) => item.status).join(",")}` };
    }
    return { ok: true, value: { current, endpoint: endpoints[0], process: processes[0] } };
  });
}

async function previewUrl(endpointId) {
  const data = await graphql(CREATE_PREVIEW, { endpointId });
  return data.createSessionEndpointPreview.url;
}

async function dumpDom(url, offline = false) {
  const profile = await fsp.mkdtemp(path.join(os.tmpdir(), "trace-design-smoke-"));
  try {
    const args = [
      "--headless=new",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${profile}`,
      "--virtual-time-budget=5000",
      ...(offline ? ["--host-resolver-rules=MAP * 0.0.0.0"] : []),
      "--dump-dom",
      url,
    ];
    const { stdout } = await execFileAsync(chromeExecutable, args, {
      maxBuffer: 30 * 1024 * 1024,
      timeout: 60_000,
    });
    return stdout;
  } finally {
    await fsp.rm(profile, { recursive: true, force: true });
  }
}

async function verifyCanvas(url, expectedScreens) {
  return poll(`${expectedScreens} rendered design screens`, async () => {
    const dom = await dumpDom(url);
    const count = (dom.match(/data-screen-id=/g) ?? []).length;
    if (!dom.includes(marker)) return { ok: false, detail: `marker missing; screens=${count}` };
    if (count !== expectedScreens) return { ok: false, detail: `rendered screens=${count}` };
    for (const control of ["Zoom in", "Zoom out", "Fit", "Export HTML", "Focus"]) {
      if (!dom.includes(control)) return { ok: false, detail: `control missing: ${control}` };
    }
    return { ok: true, value: dom };
  });
}

async function send(sessionId, text) {
  await graphql(SEND_MESSAGE, { sessionId, text });
}

async function verifyOfflineExport(livePreviewUrl, expectedScreens) {
  const exportUrl = new URL(livePreviewUrl);
  exportUrl.pathname = "/__trace_design_export";
  const response = await fetch(exportUrl, { redirect: "follow" });
  const html = await response.text();
  if (!response.ok)
    throw new Error(`Design export failed (${response.status}): ${html.slice(0, 500)}`);
  if (!response.headers.get("content-disposition")?.includes('filename="design.html"')) {
    throw new Error("Design export did not return the design.html attachment");
  }
  if (/<(?:script|link)\b[^>]*(?:src|href)=["'](?!data:|#)/i.test(html)) {
    throw new Error("Design export contains a non-inline script or stylesheet");
  }
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "trace-design-export-smoke-"));
  try {
    const file = path.join(directory, "design.html");
    await fsp.writeFile(file, html);
    const dom = await dumpDom(`file://${file}`, true);
    const count = (dom.match(/data-screen-id=/g) ?? []).length;
    if (count !== expectedScreens || !dom.includes(marker)) {
      throw new Error(`Offline design rendered ${count}/${expectedScreens} screens or lost marker`);
    }
    for (const control of ["Zoom in", "Zoom out", "Fit", "Focus"]) {
      if (!dom.includes(control)) throw new Error(`Offline design lost ${control}`);
    }
  } finally {
    await fsp.rm(directory, { recursive: true, force: true });
  }
}

const createdGroups = [];
try {
  process.stdout.write("Starting cloud design session smoke…\n");
  const initialPrompt =
    process.env.TRACE_SMOKE_DESIGN_PROMPT ??
    `Create four clearly labeled onboarding variations, each with Default, Loading, and Error states (exactly twelve screens). Put the exact visible text ${marker} on every screen. Use interactive buttons and commit when complete.`;
  const data = await graphql(START_DESIGN, {
    input: {
      kind: "design",
      hosting: "cloud",
      prompt: initialPrompt,
      ...(process.env.TRACE_SMOKE_MODEL ? { model: process.env.TRACE_SMOKE_MODEL } : {}),
      ...(process.env.TRACE_SMOKE_TOOL ? { tool: process.env.TRACE_SMOKE_TOOL } : {}),
      ...(process.env.TRACE_SMOKE_ENVIRONMENT_ID
        ? { environmentId: process.env.TRACE_SMOKE_ENVIRONMENT_ID }
        : {}),
    },
  });
  const session = data.startSession;
  if (session.hosting !== "cloud" || session.sessionGroup?.kind !== "design") {
    throw new Error(
      `Unexpected session: hosting=${session.hosting} kind=${session.sessionGroup?.kind}`,
    );
  }
  createdGroups.push(session.sessionGroupId);

  const ready = await waitForReadyRuntime(session.sessionGroupId);
  await waitForAgent(session.sessionGroupId);
  const liveUrl = await previewUrl(ready.endpoint.id);
  await verifyCanvas(liveUrl, 12);

  await send(
    session.id,
    "Add one Empty state to each of the four variations, for exactly sixteen total screens. Commit when complete.",
  );
  await waitForAgent(session.sessionGroupId);
  const afterHmr = await waitForReadyRuntime(session.sessionGroupId);
  if (afterHmr.endpoint.id !== ready.endpoint.id || afterHmr.process.id !== ready.process.id) {
    throw new Error("The HMR edit created a second process or endpoint");
  }
  await verifyCanvas(liveUrl, 16);

  await send(
    session.id,
    "Before changing the design, use the existing question tool to ask me which accent color to use. Do not continue until I answer.",
  );
  await waitForAgent(session.sessionGroupId, "needs_input");
  await send(session.id, "Use cobalt blue, then finish without adding or removing screens.");
  await waitForAgent(session.sessionGroupId);
  await verifyCanvas(liveUrl, 16);
  await verifyOfflineExport(liveUrl, 16);

  process.stdout.write(
    `Trace cloud design session smoke passed.\nSession: ${session.id}\nGroup: ${session.sessionGroupId}\nEndpoint: ${ready.endpoint.id}\n`,
  );
} finally {
  if (keepResources) {
    process.stdout.write("TRACE_SMOKE_KEEP=1 — leaving design resources in place.\n");
  } else {
    for (const id of createdGroups) {
      await graphql(ARCHIVE_GROUP, { id: id }).catch((error) => {
        process.stdout.write(`Teardown failed for ${id}: ${error.message}\n`);
      });
    }
  }
}
