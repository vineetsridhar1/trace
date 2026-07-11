#!/usr/bin/env node
// Minimal local launcher for Trace provisioned runtimes — runs each session as
// a local Docker container. DEV/QA ONLY: no isolation, no quotas, trusts its
// bearer secret. It implements the same start/stop/status contract as the Fly
// and ECS reference launchers (see ../fly, ../aws-ecs).
//
// Usage:
//   TRACE_RUNTIME_IMAGE=trace-agent-runtime:dev \
//   LAUNCHER_SECRET=dev-secret \
//   node examples/launchers/local-docker/server.mjs
//
// Then configure a provisioned Agent Environment whose start/stop/status URLs
// point at http://localhost:8787/trace/{start-session,stop-session,session-status}
// and whose bearer secret matches LAUNCHER_SECRET. See README.md.

import { execFile } from "node:child_process";
import http from "node:http";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT || 8787);
const SECRET = process.env.LAUNCHER_SECRET || "";
const IMAGE = process.env.TRACE_RUNTIME_IMAGE || "trace-agent-runtime:dev";
// host.docker.internal is built in on Docker Desktop (macOS/Windows); on Linux
// we map it to the host gateway so the container can reach the dev server.
const ADD_HOST = process.env.LAUNCHER_ADD_HOST || "host.docker.internal:host-gateway";

function containerName(runtimeInstanceId) {
  const safe = String(runtimeInstanceId || "").replace(/[^a-zA-Z0-9_.-]/g, "-");
  return `trace-rt-${safe}`;
}

function authorized(req) {
  if (!SECRET) return true;
  const header = req.headers.authorization;
  return header === `Bearer ${SECRET}`;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}

async function containerRunning(name) {
  try {
    const { stdout } = await execFileAsync("docker", [
      "inspect",
      "-f",
      "{{.State.Running}}",
      name,
    ]);
    return stdout.trim() === "true";
  } catch {
    return false; // not found
  }
}

async function startSession(body) {
  const runtimeInstanceId = body.runtimeInstanceId || `runtime_${Date.now()}`;
  const name = containerName(runtimeInstanceId);

  // Idempotent: if a container for this runtime already exists, reuse it.
  if (await containerRunning(name)) {
    return { runtimeId: name, status: "provisioning", label: "local-docker (existing)" };
  }
  await execFileAsync("docker", ["rm", "-f", name]).catch(() => {});

  const env = body.bootstrapEnv && typeof body.bootstrapEnv === "object" ? body.bootstrapEnv : {};
  const envArgs = [];
  for (const [key, value] of Object.entries(env)) {
    if (value == null) continue;
    envArgs.push("-e", `${key}=${String(value)}`);
  }

  const args = [
    "run",
    "-d",
    "--name",
    name,
    "--add-host",
    ADD_HOST,
    ...envArgs,
    IMAGE,
  ];
  const { stdout } = await execFileAsync("docker", args);
  const containerId = stdout.trim();
  console.log(`[local-docker] started ${name} (${containerId.slice(0, 12)}) for session ${body.sessionId}`);
  return { runtimeId: name, status: "provisioning", label: "local-docker" };
}

async function stopSession(body) {
  const runtimeId = body.runtimeId;
  if (!runtimeId) return { ok: true, status: "stopped" };
  await execFileAsync("docker", ["rm", "-f", runtimeId]).catch(() => {});
  console.log(`[local-docker] stopped ${runtimeId}`);
  return { ok: true, status: "stopped" };
}

async function sessionStatus(body) {
  const runtimeId = body.runtimeId;
  if (!runtimeId) return { status: "unknown" };
  const running = await containerRunning(runtimeId);
  return { status: running ? "running" : "terminated" };
}

const ROUTES = {
  "/trace/start-session": startSession,
  "/trace/stop-session": stopSession,
  "/trace/session-status": sessionStatus,
};

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/healthz") return send(res, 200, { ok: true });
  const handler = req.method === "POST" ? ROUTES[req.url ?? ""] : undefined;
  if (!handler) return send(res, 404, { error: "not found" });
  if (!authorized(req)) return send(res, 401, { error: "unauthorized" });
  try {
    const body = await readJson(req);
    const result = await handler(body);
    send(res, 200, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[local-docker] ${req.url} failed: ${message}`);
    send(res, 500, { error: message });
  }
});

server.listen(PORT, () => {
  console.log(`[local-docker] launcher on http://localhost:${PORT} (image: ${IMAGE})`);
  if (!SECRET) console.warn("[local-docker] LAUNCHER_SECRET is unset — auth is disabled (dev only)");
});
