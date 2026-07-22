import { createServer as createHttpServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { buildSelfContainedHtml } from "./server/export-html";

const app = express();
const server = createHttpServer(app);
const port = Number(process.env.PORT ?? 3000);
const root = dirname(fileURLToPath(import.meta.url));
const exportBuilds = new Map<string, Promise<string>>();

app.get("/__trace_design_export", async (request, response) => {
  try {
    const commitSha = typeof request.query.ref === "string" ? request.query.ref : undefined;
    const cacheKey = commitSha ?? "workspace";
    let exportBuild = exportBuilds.get(cacheKey);
    if (!exportBuild) {
      exportBuild = buildSelfContainedHtml(root, commitSha).finally(() => {
        exportBuilds.delete(cacheKey);
      });
      exportBuilds.set(cacheKey, exportBuild);
    }
    const html = await exportBuild;
    response.set({
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="design.html"',
      "Content-Type": "text/html; charset=utf-8",
    });
    response.send(html);
  } catch (error) {
    response.status(422).json({
      error: error instanceof Error ? error.message : "Unable to export this design",
    });
  }
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(join(root, "dist")));
  app.use((_request, response) => response.sendFile(join(root, "dist", "index.html")));
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    appType: "spa",
    server: { allowedHosts: true, hmr: { server }, middlewareMode: true },
  });
  app.use(vite.middlewares);
}

server.listen(port, "0.0.0.0", () => {
  console.log(`Trace design ready at http://0.0.0.0:${port}`);
});
