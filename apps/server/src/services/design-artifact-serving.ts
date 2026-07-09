import type express from "express";
import { prisma } from "../lib/db.js";

const USER_CONTENT_DOMAIN_ENV = "TRACE_USER_CONTENT_DOMAIN";
const USER_CONTENT_PROTOCOL_ENV = "TRACE_USER_CONTENT_PROTOCOL";
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

export function buildDesignArtifactPublicUrl(artifactId: string, publishedAt?: Date | null) {
  if (!publishedAt || !ARTIFACT_ID_PATTERN.test(artifactId)) return null;
  const domain = configuredUserContentDomain();
  if (!domain) return null;
  const protocol = process.env[USER_CONTENT_PROTOCOL_ENV]?.trim().replace(/:$/, "") || "https";
  return `${protocol}://${artifactId}.${domain}/`;
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
    var params = new URLSearchParams(window.location.search);
    var parentOrigin = params.get("parentOrigin");
    var nonce = params.get("nonce");

    function postToParent(message) {
      if (!parentOrigin) return;
      window.parent.postMessage(Object.assign({ nonce: nonce }, message), parentOrigin);
    }

    function isAuthorizedParent(event) {
      if (!parentOrigin || event.origin !== parentOrigin) return false;
      if (nonce && (!event.data || event.data.nonce !== nonce)) return false;
      return true;
    }

    function installOverlay() {
      document.addEventListener("click", function(event) {
        var target = event.target;
        if (!target || !target.closest) return;
        var el = target.closest("[data-el]");
        if (!el) return;
        postToParent({
          type: "trace:artifact:element-selected",
          anchor: {
            id: el.getAttribute("data-el"),
            text: (el.textContent || "").trim().slice(0, 500),
          },
        });
      }, true);
    }

    window.addEventListener("error", function(event) {
      postToParent({
        type: "trace:artifact:error",
        message: event.message || "Artifact script error",
        stack: event.error && event.error.stack ? String(event.error.stack) : null,
      });
    });

    postToParent({ type: "trace:artifact:ready" });
    window.addEventListener("message", function(event) {
      if (!isAuthorizedParent(event)) return;
      var data = event.data || {};
      var isLegacyRender = data.type === "trace:artifact_html";
      var isRender = data.type === "trace:artifact:render";
      if ((!isRender && !isLegacyRender) || typeof data.html !== "string") return;
      try {
        document.open();
        document.write(data.html);
        document.close();
        if (data.overlayEnabled !== false) installOverlay();
        postToParent({ type: "trace:artifact:rendered" });
      } catch (error) {
        postToParent({
          type: "trace:artifact:error",
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error && error.stack ? error.stack : null,
        });
      }
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
