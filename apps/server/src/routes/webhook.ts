import { Router, type Router as RouterType, type Request, type Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "../lib/db.js";
import { sessionService } from "../services/session.js";

const router: RouterType = Router();

interface PullRequestPayload {
  action: string;
  pull_request: {
    html_url: string;
    number: number;
    merged: boolean;
    head: {
      ref: string;
    };
  };
  repository: {
    full_name: string;
    html_url: string;
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parsePullRequestPayload(value: unknown): PullRequestPayload | null {
  const payload = asRecord(value);
  const repository = asRecord(payload?.repository);
  const pullRequest = asRecord(payload?.pull_request);
  const head = asRecord(pullRequest?.head);

  if (
    !payload ||
    typeof payload.action !== "string" ||
    !repository ||
    typeof repository.full_name !== "string" ||
    typeof repository.html_url !== "string" ||
    !pullRequest ||
    typeof pullRequest.html_url !== "string" ||
    typeof pullRequest.number !== "number" ||
    typeof pullRequest.merged !== "boolean" ||
    !head ||
    typeof head.ref !== "string"
  ) {
    return null;
  }

  return {
    action: payload.action,
    repository: {
      full_name: repository.full_name,
      html_url: repository.html_url,
    },
    pull_request: {
      html_url: pullRequest.html_url,
      number: pullRequest.number,
      merged: pullRequest.merged,
      head: {
        ref: head.ref,
      },
    },
  };
}

async function findMatchingRepo(
  rawBody: string,
  signature: string,
  hookId: string | undefined,
  repoFullName: string,
) {
  if (hookId) {
    const exactMatches = await prisma.repo.findMany({
      where: {
        webhookId: hookId,
        webhookSecret: { not: null },
      },
    });

    const exactRepo = exactMatches.find(
      (candidate) =>
        candidate.webhookSecret != null &&
        verifySignature(rawBody, signature, candidate.webhookSecret),
    );
    if (exactRepo) return { repo: exactRepo } as const;
    if (exactMatches.length > 0) return { error: "unauthorized" as const };
  }

  const repoCandidates = await prisma.repo.findMany({
    where: {
      remoteUrl: { contains: repoFullName, mode: "insensitive" },
      webhookSecret: { not: null },
    },
  });

  const repo = repoCandidates.find(
    (candidate) =>
      candidate.webhookSecret != null &&
      verifySignature(rawBody, signature, candidate.webhookSecret),
  );
  if (repo) return { repo } as const;

  return { error: repoCandidates.length === 0 ? ("missing" as const) : ("unauthorized" as const) };
}

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

router.post("/", async (req: Request, res: Response) => {
  const event =
    typeof req.headers["x-github-event"] === "string" ? req.headers["x-github-event"] : undefined;
  const signature =
    typeof req.headers["x-hub-signature-256"] === "string"
      ? req.headers["x-hub-signature-256"]
      : undefined;
  const hookId =
    typeof req.headers["x-github-hook-id"] === "string"
      ? req.headers["x-github-hook-id"]
      : undefined;

  console.log("[webhook] Received GitHub webhook:", { event, hookId, hasSignature: !!signature });

  if (event !== "pull_request") {
    res.status(200).json({ ignored: true, reason: "not a pull_request event" });
    return;
  }

  if (!signature) {
    res.status(401).json({ error: "Missing signature" });
    return;
  }

  // req.body is a raw Buffer because of express.raw() middleware
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body.toString("utf-8")
    : typeof req.body === "string"
      ? req.body
      : "";

  let payload: PullRequestPayload;
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    const validated = parsePullRequestPayload(parsed);
    if (!validated) {
      throw new Error("invalid payload shape");
    }
    payload = validated;
  } catch {
    res.status(400).json({ error: "Invalid pull_request payload" });
    return;
  }

  const repoMatch = await findMatchingRepo(
    rawBody,
    signature,
    hookId,
    payload.repository.full_name,
  );
  if ("error" in repoMatch) {
    if (repoMatch.error === "missing") {
      console.log("[webhook] No matching repo found for:", payload.repository.full_name);
      res.status(404).json({ error: "No matching repo with webhook configured" });
      return;
    }
    console.log("[webhook] Signature verification failed for:", payload.repository.full_name);
    res.status(401).json({ error: "Invalid signature" });
    return;
  }
  const repo = repoMatch.repo;

  const { action, pull_request: pr } = payload;
  const headBranch = pr.head.ref;

  // Find session(s) with this branch on this repo
  const session = await prisma.session.findFirst({
    where: {
      branch: headBranch,
      repoId: repo.id,
    },
    select: { id: true, organizationId: true, status: true },
  });

  if (!session) {
    console.log("[webhook] No session found for branch:", headBranch, "on repo:", repo.id);
    res.status(200).json({ ignored: true, reason: "no matching session for branch" });
    return;
  }

  if (action === "opened" || action === "reopened") {
    await sessionService.markPrOpened({
      sessionId: session.id,
      prUrl: pr.html_url,
      organizationId: session.organizationId,
    });
    res.status(200).json({ ok: true, action: "pr_opened", sessionId: session.id });
    return;
  }

  if (action === "closed" && pr.merged) {
    await sessionService.markPrMerged({
      sessionId: session.id,
      prUrl: pr.html_url,
      organizationId: session.organizationId,
    });
    res.status(200).json({ ok: true, action: "pr_merged", sessionId: session.id });
    return;
  }

  res.status(200).json({ ignored: true, reason: `unhandled action: ${action}` });
});

export default router;
