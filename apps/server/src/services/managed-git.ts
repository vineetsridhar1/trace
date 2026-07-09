import { execFile, spawn } from "child_process";
import { randomUUID } from "crypto";
import type { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { authenticateProvisionedRuntimeToken } from "../lib/runtime-adapters.js";
import { buildDefaultAppSetupConfig } from "./app-starter-config.js";
import { eventService } from "./event.js";

const execFileAsync = promisify(execFile);
const DEFAULT_BRANCH = "main";
const GIT_SERVICE_COMMANDS = {
  "git-upload-pack": "upload-pack",
  "git-receive-pack": "receive-pack",
} as const;

type GitService = keyof typeof GIT_SERVICE_COMMANDS;
type ManagedRepoHead = {
  ref: string;
  branch: string;
  commitSha: string;
};
type PrismaTx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

function gitStorageRoot(): string {
  return process.env.GIT_STORAGE_ROOT?.trim() || path.join(process.cwd(), ".trace-managed-git");
}

function assertPublicServerUrl(): URL {
  const raw = process.env.TRACE_SERVER_PUBLIC_URL?.trim();
  if (!raw) {
    throw new Error("TRACE_SERVER_PUBLIC_URL is required for managed git remotes");
  }
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("TRACE_SERVER_PUBLIC_URL must use http:// or https://");
  }
  return url;
}

function managedRepoPath(repoId: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(repoId)) {
    throw new Error("Invalid managed repo id");
  }
  return path.join(gitStorageRoot(), `${repoId}.git`);
}

function buildManagedRemoteUrl(organizationId: string, repoId: string): string {
  const url = assertPublicServerUrl();
  url.pathname = `${url.pathname.replace(/\/$/, "")}/git/${organizationId}/${repoId}.git`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function pktLine(value: string): Buffer {
  const payload = Buffer.from(value, "utf8");
  const length = (payload.length + 4).toString(16).padStart(4, "0");
  return Buffer.concat([Buffer.from(length, "ascii"), payload]);
}

function parseBasicPassword(header: string | undefined): string | null {
  if (!header?.startsWith("Basic ")) return null;
  const encoded = header.slice("Basic ".length).trim();
  let decoded: string;
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return null;
  }
  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex < 0) return null;
  return decoded.slice(separatorIndex + 1);
}

async function ensureAuthorizedRuntime(req: Request, organizationId: string, repoId: string) {
  const token = parseBasicPassword(req.headers.authorization);
  const auth = token ? authenticateProvisionedRuntimeToken(token) : null;
  if (!auth || auth.organizationId !== organizationId) return null;

  const repo = await prisma.repo.findFirst({
    where: { id: repoId, organizationId, provider: "managed" },
    select: { id: true },
  });
  if (!repo) return null;

  const session = await prisma.session.findFirst({
    where: {
      id: auth.sessionId,
      organizationId,
      OR: [{ repoId }, { sessionGroup: { repoId } }],
    },
    select: { id: true },
  });
  return session ? auth : null;
}

async function initBareRepo(repoPath: string): Promise<void> {
  if (fs.existsSync(repoPath)) return;
  fs.mkdirSync(path.dirname(repoPath), { recursive: true });
  await execFileAsync("git", ["init", "--bare", "--initial-branch", DEFAULT_BRANCH, repoPath]);
}

function parseBareRepoHeads(stdout: string): ManagedRepoHead[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const separatorIndex = line.lastIndexOf(":");
      if (separatorIndex < 0) return [];
      const ref = line.slice(0, separatorIndex);
      const commitSha = line.slice(separatorIndex + 1);
      if (!ref.startsWith("refs/heads/") || !/^[0-9a-f]{40,64}$/i.test(commitSha)) return [];
      return [
        {
          ref,
          branch: ref.slice("refs/heads/".length),
          commitSha,
        },
      ];
    });
}

async function listBareRepoHeads(repoPath: string): Promise<ManagedRepoHead[]> {
  const { stdout } = await execFileAsync("git", [
    "--git-dir",
    repoPath,
    "for-each-ref",
    "--format=%(refname):%(objectname)",
    "refs/heads",
  ]);
  return parseBareRepoHeads(stdout);
}

function runGitHttpService(input: {
  reqBody?: Buffer;
  res: Response;
  service: GitService;
  repoPath: string;
  advertiseRefs?: boolean;
  onSuccess?: () => Promise<void> | void;
}) {
  const command = GIT_SERVICE_COMMANDS[input.service];
  const args = [
    command,
    "--stateless-rpc",
    ...(input.advertiseRefs ? ["--advertise-refs"] : []),
    input.repoPath,
  ];
  const child = spawn("git", args, { stdio: ["pipe", "pipe", "pipe"] });
  const stderr: Buffer[] = [];

  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
  child.on("error", (error) => {
    if (!input.res.headersSent) input.res.status(500);
    input.res.end(error.message);
  });
  child.on("close", (code) => {
    if (code === 0) {
      void Promise.resolve(input.onSuccess?.()).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[managed-git] post-receive side effect failed: ${message}`);
      });
      return;
    }
    if (input.res.writableEnded) return;
    const message = Buffer.concat(stderr).toString("utf8") || `git ${command} failed`;
    if (!input.res.headersSent) input.res.status(500);
    input.res.end(message);
  });

  if (input.advertiseRefs) {
    input.res.write(pktLine(`# service=${input.service}\n`));
    input.res.write(Buffer.from("0000", "ascii"));
  } else {
    child.stdin.end(input.reqBody ?? Buffer.alloc(0));
  }
  child.stdout.pipe(input.res);
  if (input.advertiseRefs) child.stdin.end();
}

export const managedGitService = {
  defaultBranch: DEFAULT_BRANCH,

  buildManagedRemoteUrl,

  async prepareBareRepo(repoId: string): Promise<string> {
    const repoPath = managedRepoPath(repoId);
    await initBareRepo(repoPath);
    return repoPath;
  },

  async createAppRepo(input: {
    organizationId: string;
    name: string;
    tx?: PrismaTx;
  }): Promise<{ id: string; name: string; remoteUrl: string; defaultBranch: string }> {
    const repoId = randomUUID();
    const repoName = input.name.trim().slice(0, 80) || "Trace app";
    const remoteUrl = buildManagedRemoteUrl(input.organizationId, repoId);
    await this.prepareBareRepo(repoId);
    const db = input.tx ?? prisma;
    await db.repo.create({
      data: {
        id: repoId,
        organizationId: input.organizationId,
        name: repoName,
        provider: "managed",
        remoteUrl,
        defaultBranch: DEFAULT_BRANCH,
        setupConfig: buildDefaultAppSetupConfig(),
      },
    });
    return { id: repoId, name: repoName, remoteUrl, defaultBranch: DEFAULT_BRANCH };
  },

  async recordManagedRepoPush(input: {
    organizationId: string;
    repoId: string;
    sessionId: string;
    repoPath?: string;
    heads?: ManagedRepoHead[];
  }) {
    const heads =
      input.heads ?? (await listBareRepoHeads(input.repoPath ?? managedRepoPath(input.repoId)));
    await eventService.create({
      organizationId: input.organizationId,
      scopeType: "system",
      scopeId: input.repoId,
      eventType: "repo_branch_pushed",
      payload: {
        repoId: input.repoId,
        sessionId: input.sessionId,
        heads,
      } as Prisma.InputJsonValue,
      actorType: "system",
      actorId: "managed-git",
    });
  },

  async handleInfoRefs(req: Request, res: Response, params: { orgId: string; repoId: string }) {
    const service = typeof req.query.service === "string" ? req.query.service : "";
    if (service !== "git-upload-pack" && service !== "git-receive-pack") {
      res.status(400).json({ error: "Unsupported git service" });
      return;
    }
    const auth = await ensureAuthorizedRuntime(req, params.orgId, params.repoId);
    if (!auth) {
      res.set("WWW-Authenticate", 'Basic realm="Trace managed git"');
      res.status(401).end("Unauthorized");
      return;
    }
    res.type(`application/x-${service}-advertisement`);
    res.set("Cache-Control", "no-cache");
    runGitHttpService({
      res,
      service,
      repoPath: managedRepoPath(params.repoId),
      advertiseRefs: true,
    });
  },

  async handleRpc(
    req: Request,
    res: Response,
    params: { orgId: string; repoId: string; service: GitService },
  ) {
    const auth = await ensureAuthorizedRuntime(req, params.orgId, params.repoId);
    if (!auth) {
      res.set("WWW-Authenticate", 'Basic realm="Trace managed git"');
      res.status(401).end("Unauthorized");
      return;
    }
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    res.type(`application/x-${params.service}-result`);
    res.set("Cache-Control", "no-cache");
    runGitHttpService({
      reqBody: body,
      res,
      service: params.service,
      repoPath: managedRepoPath(params.repoId),
      onSuccess:
        params.service === "git-receive-pack"
          ? () =>
              this.recordManagedRepoPush({
                organizationId: params.orgId,
                repoId: params.repoId,
                sessionId: auth.sessionId,
                repoPath: managedRepoPath(params.repoId),
              })
          : undefined,
    });
  },
};
