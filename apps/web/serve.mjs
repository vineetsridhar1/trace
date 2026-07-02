import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT || 3000);
const distDir = resolve(fileURLToPath(new URL("./dist", import.meta.url)));
const indexFile = join(distDir, "index.html");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".woff2", "font/woff2"],
]);

function isInsideDist(filePath) {
  return filePath === distDir || filePath.startsWith(`${distDir}${sep}`);
}

function resolveRequestPath(pathname) {
  const normalized = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const filePath = resolve(join(distDir, normalized));
  return isInsideDist(filePath) ? filePath : null;
}

function cacheControlFor(filePath) {
  const relativePath = filePath.slice(distDir.length + 1);
  if (relativePath.startsWith("assets/")) {
    return "public, max-age=31536000, immutable";
  }
  return "no-cache";
}

function sendFile(req, res, filePath) {
  const stat = statSync(filePath);
  const type = contentTypes.get(extname(filePath)) ?? "application/octet-stream";
  res.writeHead(200, {
    "Cache-Control": cacheControlFor(filePath),
    "Content-Length": stat.size,
    "Content-Type": type,
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
}

function sendNotFound(res) {
  res.writeHead(404, {
    "Cache-Control": "no-cache",
    "Content-Type": "text/plain; charset=utf-8",
  });
  res.end("Not found");
}

const server = createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method not allowed");
    return;
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const requestedFile = resolveRequestPath(url.pathname);
  if (!requestedFile) {
    sendNotFound(res);
    return;
  }

  if (existsSync(requestedFile) && statSync(requestedFile).isFile()) {
    sendFile(req, res, requestedFile);
    return;
  }

  if (extname(url.pathname)) {
    sendNotFound(res);
    return;
  }

  sendFile(req, res, indexFile);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[trace] Web ready at http://0.0.0.0:${port}`);
});
