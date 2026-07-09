import type express from "express";
import { prisma } from "../lib/db.js";

const USER_CONTENT_DOMAIN_ENV = "TRACE_USER_CONTENT_DOMAIN";
const ARTIFACT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,127}$/i;

function configuredUserContentDomain() {
  const domain = process.env[USER_CONTENT_DOMAIN_ENV]?.trim().toLowerCase();
  return domain ? domain.replace(/^\.+|\.+$/g, "") : null;
}

function normalizeHost(host: string | undefined | null) {
  if (!host) return null;
  const withoutPort = host.split(":")[0]?.trim().toLowerCase();
  return withoutPort || null;
}

export function artifactIdFromUserContentHost(host: string | undefined | null) {
  const domain = configuredUserContentDomain();
  const normalizedHost = normalizeHost(host);
  if (!domain || !normalizedHost) return null;

  const suffix = `.${domain}`;
  if (!normalizedHost.endsWith(suffix)) return null;

  const artifactId = normalizedHost.slice(0, -suffix.length);
  if (!ARTIFACT_ID_PATTERN.test(artifactId) || artifactId.includes(".")) return null;
  return artifactId;
}

export function buildDesignArtifactBootstrapHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Trace design artifact</title>
  <style>
    html, body {
      margin: 0;
      min-height: 100%;
      background: white;
    }
  </style>
</head>
<body>
  <script>
    window.parent.postMessage({ type: "trace:artifact_bootstrap_ready" }, "*");
    window.addEventListener("message", function(event) {
      var data = event.data || {};
      if (data.type !== "trace:artifact_html" || typeof data.html !== "string") return;
      document.open();
      document.write(data.html);
      document.close();
    });
  </script>
</body>
</html>`;
}

function setDesignArtifactHeaders(res: express.Response, options: { bootstrap: boolean }) {
  res.set({
    "Cache-Control": options.bootstrap ? "no-store" : "public, max-age=60",
    "Content-Security-Policy":
      "default-src 'self' https: data: blob:; script-src 'unsafe-inline' 'unsafe-eval' https: data: blob:; style-src 'unsafe-inline' https:; img-src https: data: blob:; font-src https: data:; connect-src https:; frame-ancestors *; base-uri 'none'; form-action 'none'",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
}

export async function handleDesignArtifactUserContent(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const artifactId = artifactIdFromUserContentHost(req.headers.host);
  if (!artifactId) {
    next();
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).end("Method not allowed");
    return;
  }

  const path = req.path || "/";
  if (path === "/_bootstrap") {
    setDesignArtifactHeaders(res, { bootstrap: true });
    res.type("html").send(buildDesignArtifactBootstrapHtml());
    return;
  }

  if (path !== "/") {
    res.status(404).end("Not found");
    return;
  }

  const artifact = await prisma.artifact.findFirst({
    where: {
      id: artifactId,
      contentType: "text/html",
      publishedAt: { not: null },
    },
    select: {
      html: true,
    },
  });

  if (!artifact) {
    res.status(404).end("Not found");
    return;
  }

  setDesignArtifactHeaders(res, { bootstrap: false });
  res.type("html").send(artifact.html);
}
