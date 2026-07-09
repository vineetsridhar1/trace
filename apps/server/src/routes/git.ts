import { spawn } from "child_process";
import { gunzip } from "zlib";
import { promisify } from "util";
import { Router, type Router as RouterType, type Request, type Response } from "express";
import { AuthorizationError } from "../lib/errors.js";
import { gitStorage, isSafeStorageId } from "../lib/git-storage/index.js";
import {
  filterAcceptedCommands,
  gitSubcommand,
  isGitService,
  parseReceivePackCommands,
  serviceAdvertisementPrefix,
  type GitService,
} from "../lib/git-http.js";
import { managedGitService, type ManagedGitAuth } from "../services/managed-git.js";

const gunzipAsync = promisify(gunzip);
const router: RouterType = Router();

// Pushes buffer fully in memory so receive-pack commands can be parsed before
// handing the pack to git. Bounded to keep a hostile client from exhausting
// memory; generated app/design projects are far smaller than this.
const MAX_GIT_BODY_BYTES = 100 * 1024 * 1024;

function stripDotGit(repoParam: string): string {
  return repoParam.endsWith(".git") ? repoParam.slice(0, -4) : repoParam;
}

/**
 * Extract the git token from the Authorization header. git sends credentials
 * as HTTP Basic (token as the password); Bearer is accepted for direct API use.
 */
function readGitToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, value] = header.split(" ");
  if (!value) return null;
  if (scheme.toLowerCase() === "bearer") return value.trim() || null;
  if (scheme.toLowerCase() === "basic") {
    const decoded = Buffer.from(value, "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    // Password carries the token; username is ignored (git requires a username,
    // callers use e.g. "trace"). Fall back to the whole string if no colon.
    const password = sep === -1 ? decoded : decoded.slice(sep + 1);
    return password.trim() || null;
  }
  return null;
}

function requireAuth(res: Response): void {
  res.setHeader("WWW-Authenticate", 'Basic realm="Trace Managed Git"');
  res.status(401).send("Authentication required");
}

async function readBody(req: Request): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > MAX_GIT_BODY_BYTES) throw new Error("Managed git request body too large");
    chunks.push(buf);
  }
  const body = Buffer.concat(chunks);
  if (req.headers["content-encoding"] === "gzip") return gunzipAsync(body);
  return body;
}

type ResolvedRequest = {
  organizationId: string;
  repoId: string;
  repoPath: string;
  auth: ManagedGitAuth;
};

/**
 * Validate ids, confirm the managed repo exists, and authorize the token for
 * the requested service. Writes the appropriate HTTP error and returns null on
 * any failure so the handler can bail.
 */
async function resolve(
  req: Request,
  res: Response,
  service: GitService,
): Promise<ResolvedRequest | null> {
  const organizationId = String(req.params.orgId ?? "");
  const repoId = stripDotGit(String(req.params.repoId ?? ""));
  if (!isSafeStorageId(organizationId) || !isSafeStorageId(repoId)) {
    res.status(400).send("Invalid repository path");
    return null;
  }

  const token = readGitToken(req);
  if (!token) {
    requireAuth(res);
    return null;
  }

  // Authorize on token claims BEFORE any DB lookup, so a token that isn't
  // scoped to this repo is rejected without revealing whether the repo exists
  // (no 404-vs-403 enumeration oracle).
  let auth: ManagedGitAuth;
  try {
    auth = await managedGitService.authorizeRequest({ token, organizationId, repoId, service });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      // A read-scoped token hitting receive-pack is a permission failure (403);
      // an unusable/invalid token re-prompts for credentials (401).
      const invalid = managedGitService.verifyAccessToken(token) === null;
      if (invalid) requireAuth(res);
      else res.status(403).send(error.message);
      return null;
    }
    throw error;
  }

  const repo = await managedGitService.getManagedRepo(organizationId, repoId);
  if (!repo) {
    res.status(404).send("Repository not found");
    return null;
  }

  const repoPath = gitStorage.resolveRepoPath(organizationId, repoId);
  return { organizationId, repoId, repoPath, auth };
}

// GET info/refs — ref advertisement for clone/fetch (upload-pack) and push
// (receive-pack). ?service=git-upload-pack|git-receive-pack.
router.get("/:orgId/:repoId/info/refs", async (req: Request, res: Response) => {
  const service = req.query.service;
  if (typeof service !== "string" || !isGitService(service)) {
    // "Dumb" HTTP is not supported — a service query param is required.
    res.status(400).send("Only smart HTTP git is supported");
    return;
  }

  const resolved = await resolve(req, res, service);
  if (!resolved) return;

  const child = spawn("git", [
    gitSubcommand(service),
    "--stateless-rpc",
    "--advertise-refs",
    resolved.repoPath,
  ]);
  // Don't leave git running if the client disconnects mid-request.
  res.on("close", () => {
    if (child.exitCode === null) child.kill("SIGKILL");
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on("data", (d: Buffer) => stdout.push(d));
  child.stderr.on("data", (d: Buffer) => stderr.push(d));
  child.on("error", () => {
    if (!res.headersSent) res.status(500).send("git advertisement failed");
  });
  child.on("close", (code) => {
    if (code !== 0) {
      console.error(`[git] ${service} advertise-refs exited ${code}: ${Buffer.concat(stderr)}`);
      if (!res.headersSent) res.status(500).send("git advertisement failed");
      return;
    }
    res.status(200);
    res.setHeader("Content-Type", `application/x-${service}-advertisement`);
    res.setHeader("Cache-Control", "no-cache");
    res.end(Buffer.concat([serviceAdvertisementPrefix(service), ...stdout]));
  });
});

function rpcHandler(service: GitService) {
  return async (req: Request, res: Response): Promise<void> => {
    const expectedContentType = `application/x-${service}-request`;
    if (req.headers["content-type"] !== expectedContentType) {
      res.status(415).send("Unsupported content type");
      return;
    }

    const resolved = await resolve(req, res, service);
    if (!resolved) return;

    let body: Buffer;
    try {
      body = await readBody(req);
    } catch (error) {
      res.status(400).send(error instanceof Error ? error.message : "Invalid request body");
      return;
    }

    const requestedCommands =
      service === "git-receive-pack" ? parseReceivePackCommands(body) : [];

    const child = spawn("git", [gitSubcommand(service), "--stateless-rpc", resolved.repoPath]);
    const stderr: Buffer[] = [];
    child.stderr.on("data", (d: Buffer) => stderr.push(d));
    child.on("error", () => {
      if (!res.headersSent) res.status(500).send("git operation failed");
    });
    // git may close its stdin before consuming the whole body (e.g. it rejects
    // the pack). Swallow the resulting EPIPE — an unhandled stream 'error'
    // would otherwise crash the process.
    child.stdin.on("error", () => {});
    // Kill git if the client disconnects mid-request.
    res.on("close", () => {
      if (child.exitCode === null) child.kill("SIGKILL");
    });

    res.status(200);
    res.setHeader("Content-Type", `application/x-${service}-result`);
    res.setHeader("Cache-Control", "no-cache");
    child.stdout.pipe(res);

    child.on("close", (code) => {
      if (code !== 0) {
        console.error(`[git] ${service} exited ${code}: ${Buffer.concat(stderr)}`);
        if (!res.headersSent) res.status(500).end();
        return;
      }
      if (service === "git-receive-pack" && requestedCommands.length > 0) {
        // Report only refs the repo actually accepted — receive-pack can exit 0
        // while rejecting individual updates, so reconcile against real state.
        void gitStorage
          .listRefs(resolved.organizationId, resolved.repoId)
          .then((actualRefs) => {
            const accepted = filterAcceptedCommands(requestedCommands, actualRefs);
            if (accepted.length === 0) return;
            return managedGitService.recordPush({
              organizationId: resolved.organizationId,
              repoId: resolved.repoId,
              commands: accepted,
              actorType: resolved.auth.scope === "user" ? "user" : "system",
              actorId: resolved.auth.subject,
            });
          })
          .catch((error: unknown) => {
            console.error("[git] failed to record managed push", error);
          });
      }
    });

    if (child.stdin.writable) child.stdin.end(body);
  };
}

router.post("/:orgId/:repoId/git-upload-pack", rpcHandler("git-upload-pack"));
router.post("/:orgId/:repoId/git-receive-pack", rpcHandler("git-receive-pack"));

export { router as gitRouter };
