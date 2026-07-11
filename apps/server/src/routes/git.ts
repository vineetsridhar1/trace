import { spawn } from "child_process";
import { Transform } from "stream";
import { createGunzip } from "zlib";
import { Router, type Router as RouterType, type Request, type Response } from "express";
import { AuthorizationError } from "../lib/errors.js";
import { gitStorage, isSafeStorageId } from "../lib/git-storage/index.js";
import {
  diffRefStates,
  gitSubcommand,
  isGitService,
  serviceAdvertisementPrefix,
  type GitService,
} from "../lib/git-http.js";
import { managedGitService, type ManagedGitAuth } from "../services/managed-git.js";

const router: RouterType = Router();

// Generated app/design projects should remain far below this. The limiter is a
// streaming transform, so concurrent pushes never allocate this amount in RAM.
const MAX_GIT_BODY_BYTES = 100 * 1024 * 1024;

export class GitBodyLimitStream extends Transform {
  private bytes = 0;

  constructor(private readonly maxBytes = MAX_GIT_BODY_BYTES) {
    super();
  }

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null, data?: Buffer) => void,
  ): void {
    this.bytes += chunk.length;
    if (this.bytes > this.maxBytes) {
      callback(new Error("Managed git request body too large"));
      return;
    }
    callback(null, chunk);
  }
}

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
    // The token verified (same JWT secret) but no managed repo row exists in
    // THIS server's database. That almost always means the runtime's origin
    // points at a different Trace deployment than the one that created the
    // repo — i.e. TRACE_SERVER_PUBLIC_URL on the creating server resolves to
    // another environment. Log enough to confirm which server is missing it.
    console.warn(
      `[managed-git] 404 no managed repo row: org=${organizationId} repo=${repoId} service=${service}. ` +
        "The pushing runtime's origin resolves to this server, but its DB has no such repo — " +
        "check that TRACE_SERVER_PUBLIC_URL on the session's server points back to that same deployment.",
    );
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
    if (!res.writableEnded && child.exitCode === null) child.kill("SIGKILL");
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

// Serialize receive-pack per repo so the pre/post ref snapshots that derive the
// `repo_updated` event can't interleave with a concurrent push (which would
// corrupt oldSha and actor attribution). Concurrent pushes to one managed repo
// are rare (one active project per session group), so the throughput cost is
// negligible. upload-pack (read-only) is never serialized.
const repoReceiveLocks = new Map<string, Promise<void>>();

function runExclusive(key: string, fn: () => Promise<void>): Promise<void> {
  const prev = repoReceiveLocks.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.then(
    () => {},
    () => {},
  );
  repoReceiveLocks.set(key, tail);
  void tail.then(() => {
    if (repoReceiveLocks.get(key) === tail) repoReceiveLocks.delete(key);
  });
  return run;
}

function rpcHandler(service: GitService) {
  return async (req: Request, res: Response): Promise<void> => {
    const expectedContentType = `application/x-${service}-request`;
    if (req.headers["content-type"] !== expectedContentType) {
      res.status(415).send("Unsupported content type");
      return;
    }
    const encoding = req.headers["content-encoding"];
    if (encoding !== undefined && encoding !== "identity" && encoding !== "gzip") {
      res.status(415).send("Unsupported content encoding");
      return;
    }
    const contentLength = Number(req.headers["content-length"] ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_GIT_BODY_BYTES) {
      res.status(413).send("Managed git request body too large");
      return;
    }

    const resolved = await resolve(req, res, service);
    if (!resolved) return;

    if (service === "git-receive-pack") {
      await runExclusive(
        `${resolved.organizationId}/${resolved.repoId}`,
        () => streamRpc(service, req, res, resolved, encoding),
      );
    } else {
      await streamRpc(service, req, res, resolved, encoding);
    }
  };
}

// Runs one git smart-HTTP RPC, resolving only once the response is fully
// handled (child exit + push event recorded, or a terminal error) so callers
// can serialize on the returned promise.
function streamRpc(
  service: GitService,
  req: Request,
  res: Response,
  resolved: ResolvedRequest,
  encoding: string | undefined,
): Promise<void> {
  return new Promise<void>((resolveDone) => {
    let settled = false;
    const done = (): void => {
      if (settled) return;
      settled = true;
      resolveDone();
    };

    void (async () => {
      const refsBefore =
        service === "git-receive-pack"
          ? await gitStorage.listRefs(resolved.organizationId, resolved.repoId)
          : null;

      const child = spawn("git", [gitSubcommand(service), "--stateless-rpc", resolved.repoPath]);
    const stderr: Buffer[] = [];
    child.stderr.on("data", (d: Buffer) => stderr.push(d));
    child.on("error", () => {
      if (!res.headersSent) res.status(500).send("git operation failed");
      done();
    });
    const limiter = new GitBodyLimitStream();
    const decoder = encoding === "gzip" ? createGunzip() : null;
    const input = decoder ?? req;

    let inputFailed = false;
    const failInput = (status: number, message: string): void => {
      if (inputFailed) return;
      inputFailed = true;
      req.unpipe(decoder ?? limiter);
      decoder?.unpipe(limiter);
      limiter.unpipe(child.stdin);
      decoder?.destroy();
      limiter.destroy();
      req.resume();
      if (child.exitCode === null) child.kill("SIGKILL");
      if (!res.destroyed) {
        if (!res.headersSent) res.status(status).send(message);
        else res.destroy();
      }
      done();
    };
    req.on("error", () => failInput(400, "Invalid request body"));
    decoder?.on("error", () => failInput(400, "Invalid gzip request body"));
    limiter.on("error", (error: Error) => failInput(413, error.message));
    // git may reject a request before consuming all input. Drain the remaining
    // client body without forwarding it; EPIPE is expected and process-local.
    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      limiter.unpipe(child.stdin);
      limiter.resume();
      if (error.code !== "EPIPE" && error.code !== "ERR_STREAM_DESTROYED") {
        failInput(500, "git operation failed");
      }
    });
    // Attach every error listener before starting flow: a buffered malformed
    // gzip body can fail as soon as the streams are connected.
    if (decoder) req.pipe(decoder);
    input.pipe(limiter).pipe(child.stdin);
    // Kill git if the client disconnects mid-request. If the child already
    // exited there's no close event coming, so release the lock here too.
    res.on("close", () => {
      if (!res.writableEnded && child.exitCode === null) child.kill("SIGKILL");
      else if (child.exitCode !== null) done();
    });

    res.status(200);
    res.setHeader("Content-Type", `application/x-${service}-result`);
    res.setHeader("Cache-Control", "no-cache");
    const isReceivePack = service === "git-receive-pack";
    // For pushes, keep the response open until the resulting event is durable.
    // upload-pack remains fully streaming and ends with child stdout.
    child.stdout.pipe(res, { end: !isReceivePack });

    child.on("close", async (code) => {
      if (inputFailed) {
        done();
        return;
      }
      if (code !== 0) {
        console.error(`[git] ${service} exited ${code}: ${Buffer.concat(stderr)}`);
        if (res.destroyed) {
          done();
          return;
        }
        if (!res.headersSent) res.status(500).end();
        else if (isReceivePack && !res.writableEnded) res.end();
        done();
        return;
      }
      if (isReceivePack && refsBefore) {
        // Actual pre/post state is authoritative: rejected commands leave no
        // transition and cannot produce a false repo_updated event.
        try {
          const actualRefs = await gitStorage.listRefs(resolved.organizationId, resolved.repoId);
          const accepted = diffRefStates(refsBefore, actualRefs);
          if (accepted.length > 0) {
            await managedGitService.recordPush({
              organizationId: resolved.organizationId,
              repoId: resolved.repoId,
              commands: accepted,
              actorType: resolved.auth.scope === "user" ? "user" : "system",
              actorId: resolved.auth.subject,
            });
          }
          if (!res.writableEnded) res.end();
        } catch (error: unknown) {
          console.error("[git] failed to record managed push", error);
          if (!res.destroyed) res.destroy(error instanceof Error ? error : undefined);
        }
      }
      done();
    });
    })().catch((error: unknown) => {
      console.error("[git] rpc handler failed", error);
      if (!res.headersSent) res.status(500).end();
      else if (!res.writableEnded) res.end();
      done();
    });
  });
}

router.post("/:orgId/:repoId/git-upload-pack", rpcHandler("git-upload-pack"));
router.post("/:orgId/:repoId/git-receive-pack", rpcHandler("git-receive-pack"));

export { router as gitRouter };
