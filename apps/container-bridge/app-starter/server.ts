import crypto from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

const app = express();
const server = createHttpServer(app);
const port = Number(process.env.PORT ?? 3000);
const root = dirname(fileURLToPath(import.meta.url));
const notes: Array<{ id: string; text: string }> = [];
const corsAllowedOrigins = new Set(
  (process.env.APP_CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => new URL(value).origin),
);

function requestOrigin(request: express.Request): string | null {
  const host = request.get("host");
  if (!host) return null;
  const forwardedProtocol = request.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return `${forwardedProtocol || request.protocol}://${host}`;
}

app.use((request, response, next) => {
  const origin = request.get("origin");
  if (!origin || origin === requestOrigin(request)) {
    next();
    return;
  }
  if (!corsAllowedOrigins.has(origin)) {
    response.status(403).json({ error: "Origin not allowed" });
    return;
  }

  response.vary("Origin");
  response.set({
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers":
      request.get("access-control-request-headers") ?? "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Max-Age": "600",
  });
  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }
  next();
});
app.use(express.json());

app.get("/api/notes", (_request, response) => {
  response.json({ notes });
});

app.post("/api/notes", (request, response) => {
  const body = request.body as { text?: unknown };
  const note = { id: crypto.randomUUID(), text: String(body.text ?? "") };
  notes.push(note);
  response.status(201).json({ note });
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(join(root, "dist")));
  app.use((_request, response) => response.sendFile(join(root, "dist", "index.html")));
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    appType: "spa",
    server: { hmr: { server }, middlewareMode: true },
  });
  app.use(vite.middlewares);
}

server.listen(port, "0.0.0.0", () => {
  console.log(`Trace app ready at http://0.0.0.0:${port}`);
});
