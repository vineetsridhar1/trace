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
