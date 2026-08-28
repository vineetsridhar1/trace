import { Router, type Request, type Response, type Router as RouterType } from "express";
import type { IntegrationCredentialScope } from "@trace/gql";
import { ValidationError } from "../lib/errors.js";
import {
  integrationCredentialService,
  type AuthenticatedIntegrationCredential,
} from "../services/integration-credential.js";
import { integrationSessionService } from "../services/integration-session.js";

const router: RouterType = Router();

function bearerToken(req: Request): string | null {
  const authorization = req.header("authorization");
  if (!authorization) return null;
  const [scheme, token, extra] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token || extra) return null;
  return token;
}

async function authenticate(
  req: Request,
  scope: IntegrationCredentialScope,
): Promise<AuthenticatedIntegrationCredential | null> {
  const token = bearerToken(req);
  return token ? integrationCredentialService.authenticate(token, scope) : null;
}

function requiredString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function handleError(res: Response, action: string, error: unknown): Response {
  if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
  console.error(`[integration-sessions] ${action} failed`, error);
  return res.status(500).json({ error: `Session ${action} failed` });
}

router.post("/api/v1/sessions", async (req: Request, res: Response) => {
  const credential = await authenticate(req, "sessions_create");
  if (!credential) return res.status(401).json({ error: "Invalid integration credential" });

  try {
    const session = await integrationSessionService.create(credential, {
      prompt: requiredString(req.body?.prompt),
      channelId: requiredString(req.body?.channelId),
      idempotencyKey: requiredString(req.body?.idempotencyKey),
    });
    return res.status(201).json({ session });
  } catch (error) {
    return handleError(res, "creation", error);
  }
});

router.get("/api/v1/sessions/:sessionId", async (req: Request, res: Response) => {
  const credential = await authenticate(req, "sessions_read");
  if (!credential) return res.status(401).json({ error: "Invalid integration credential" });

  try {
    const sessionId = Array.isArray(req.params.sessionId)
      ? req.params.sessionId[0]
      : req.params.sessionId;
    const session = sessionId ? await integrationSessionService.get(credential, sessionId) : null;
    if (!session) return res.status(404).json({ error: "Session not found" });
    return res.json({ session });
  } catch (error) {
    return handleError(res, "status lookup", error);
  }
});

export { router as integrationSessionsRouter };
