import fs from "fs";
import path from "path";
import express, { Router, type Router as RouterType, type Request, type Response } from "express";
import { LocalStorageAdapter } from "./local-adapter.js";

export function createLocalStorageRouter(adapter: LocalStorageAdapter): RouterType {
  const router = Router();

  // Accept any binary body up to 5MB. The PUT has a short-lived JWT in the URL
  // that carries the destination key — no session cookie required here because
  // the bridge (running on another host) also needs to download.
  router.put(
    "/uploads/local/put/:token",
    express.raw({ type: "*/*", limit: "5mb" }),
    async (req: Request, res: Response) => {
      const tokenParam = req.params.token;
      const verified = typeof tokenParam === "string" ? adapter.verifyToken(tokenParam) : null;
      if (!verified || verified.action !== "put") {
        return res.status(401).json({ error: "Invalid or expired token" });
      }
      let target: string;
      try {
        target = adapter.resolvePath(verified.key);
      } catch {
        return res.status(400).json({ error: "Invalid key" });
      }
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.writeFile(target, req.body as Buffer);
      return res.status(200).end();
    },
  );

  router.get("/uploads/local/get/:token", async (req: Request, res: Response) => {
    const tokenParam = req.params.token;
    const verified = typeof tokenParam === "string" ? adapter.verifyToken(tokenParam) : null;
    if (!verified || verified.action !== "get") {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    let target: string;
    try {
      target = adapter.resolvePath(verified.key);
    } catch {
      return res.status(400).json({ error: "Invalid key" });
    }
    if (!fs.existsSync(target)) {
      return res.status(404).json({ error: "Not found" });
    }
    // Serve uploaded files as attachments with a neutral content type so an
    // image/svg+xml payload cannot execute script in the app origin.
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const fallbackName = path.basename(verified.key) || "download";
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fallbackName.replace(/"/g, "")}"`,
    );
    return res.sendFile(target);
  });

  return router;
}
