import { Router, type Request, type Response } from "express";
import { appIntegrationService } from "../services/integration-services.js";
import { nangoConnectionProvider } from "../services/nango-connection-provider.js";

export const nangoRouter = Router();

nangoRouter.post("/", async (req: Request, res: Response) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : null;
  const rawSignature = req.headers["x-nango-hmac-sha256"];
  const signature = Array.isArray(rawSignature) ? rawSignature[0] : rawSignature;
  if (!rawBody || !nangoConnectionProvider.verifyWebhook(rawBody, signature)) {
    res.status(401).json({ error: "Invalid Nango webhook signature" });
    return;
  }
  try {
    const payload = JSON.parse(rawBody.toString("utf8")) as unknown;
    await appIntegrationService.reconcileNangoAuthWebhook(payload);
    res.status(204).end();
  } catch (error: unknown) {
    console.error("[nango] webhook processing failed", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid webhook" });
  }
});
