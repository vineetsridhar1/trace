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

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

router.post("/", async (req: Request, res: Response) => {
  const event = req.headers["x-github-event"] as string | undefined;
  const signature = req.headers["x-hub-signature-256"] as string | undefined;

  if (event !== "pull_request") {
    res.status(200).json({ ignored: true, reason: "not a pull_request event" });
    return;
  }

  if (!signature) {
    res.status(401).json({ error: "Missing signature" });
    return;
  }

  // req.body is a raw Buffer because of express.raw() middleware
  const rawBody = typeof req.body === "string" ? req.body : (req.body as Buffer).toString("utf-8");

  let payload: PullRequestPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    res.status(400).json({ error: "Invalid JSON payload" });
    return;
  }

  const repoFullName = payload.repository.full_name;

  // Find the repo by matching remoteUrl against the GitHub full name
  const repo = await prisma.repo.findFirst({
    where: {
      remoteUrl: { contains: repoFullName },
      webhookSecret: { not: null },
    },
  });

  if (!repo || !repo.webhookSecret) {
    res.status(404).json({ error: "No matching repo with webhook configured" });
    return;
  }

  if (!verifySignature(rawBody, signature, repo.webhookSecret)) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

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
