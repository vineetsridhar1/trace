import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

import { handleDesignArtifactUserContent } from "./design-artifact-serving.js";
import { prisma } from "../lib/db.js";

const execFileAsync = promisify(execFile);
const runBrowserSmoke = process.env.TRACE_RUN_DESIGN_BOOTSTRAP_BROWSER_SMOKE === "1";
const CHROME_CANDIDATES = [
  process.env.TRACE_CHROMIUM_EXECUTABLE,
  process.env.CHROMIUM_EXECUTABLE_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
].filter((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0);

function findChromeExecutable(): string | null {
  return CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        resolve(address.port);
      } else {
        reject(new Error("Could not allocate a local HTTP port"));
      }
    });
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function parentHarnessHtml(port: number) {
  const parentOrigin = `http://127.0.0.1:${port}`;
  const artifactOrigin = `http://artifact-1.traceusercontent.test:${port}`;
  const nonce = "nonce-browser-smoke";
  const artifactHtml = `<!doctype html>
<html>
<body>
  <main data-el="hero">Browser rendered design artifact</main>
  <script>
    window.parent.postMessage({
      type: "trace:artifact:self-check",
      nonce: "${nonce}",
      text: document.querySelector("[data-el='hero']").textContent
    }, "${parentOrigin}");
  </script>
</body>
</html>`;

  const serializedArtifactHtml = JSON.stringify(artifactHtml).replace(/<\/script/gi, "<\\/script");
  const serializedComments = JSON.stringify([
    {
      id: "comment-1",
      body: "Check the hero spacing",
      anchor: { type: "element", dataEl: "hero" },
    },
  ]);

  return `<!doctype html>
<html>
<body>
  <div id="status">pending</div>
  <script>
    var statusEl = document.getElementById("status");
    var frame = document.createElement("iframe");
    var nonce = "${nonce}";
    var artifactOrigin = "${artifactOrigin}";
    var artifactHtml = ${serializedArtifactHtml};

    function mark(value) {
      statusEl.textContent = statusEl.textContent + "|" + value;
    }

    function renderArtifact() {
      frame.contentWindow.postMessage({
        type: "trace:artifact:render",
        html: artifactHtml,
        overlayEnabled: true,
        comments: ${serializedComments},
        nonce: nonce
      }, artifactOrigin);
    }

    window.addEventListener("message", function(event) {
      if (event.origin !== artifactOrigin) return;
      if (!event.data || event.data.nonce !== nonce) return;
      if (event.data.type === "trace:artifact:ready") {
        mark("ready");
        renderArtifact();
      } else if (event.data.type === "trace:artifact:rendered") {
        mark("rendered:pins=" + event.data.pinCount);
      } else if (event.data.type === "trace:artifact:self-check") {
        mark("self-check:" + event.data.text);
      } else if (event.data.type === "trace:artifact:error") {
        mark("error:" + event.data.message);
      }
    });

    frame.src = artifactOrigin + "/_bootstrap?parentOrigin=" + encodeURIComponent(location.origin) + "&nonce=" + nonce;
    document.body.appendChild(frame);
  </script>
</body>
</html>`;
}

async function dumpChromeDom(input: {
  chromeExecutable: string;
  port: number;
  path: string;
  profilePrefix: string;
}) {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), input.profilePrefix));
  try {
    const { stdout } = await execFileAsync(
      input.chromeExecutable,
      [
        "--headless=new",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--no-default-browser-check",
        "--no-proxy-server",
        `--user-data-dir=${profileDir}`,
        `--host-resolver-rules=MAP *.traceusercontent.test 127.0.0.1`,
        "--virtual-time-budget=1000",
        "--dump-dom",
        `http://artifact-1.traceusercontent.test:${input.port}${input.path}`,
      ],
      { maxBuffer: 10 * 1024 * 1024, timeout: 30_000 },
    );
    return stdout;
  } finally {
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
}

describe("design artifact user-content browser integration", () => {
  const originalDomain = process.env.TRACE_USER_CONTENT_DOMAIN;
  const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    if (originalDomain === undefined) {
      delete process.env.TRACE_USER_CONTENT_DOMAIN;
    } else {
      process.env.TRACE_USER_CONTENT_DOMAIN = originalDomain;
    }
  });

  const chromeExecutable = runBrowserSmoke ? findChromeExecutable() : null;
  const runIfChrome = chromeExecutable ? it : it.skip;

  runIfChrome(
    "renders authoring preview HTML through the nonce-bound _bootstrap postMessage flow",
    async () => {
      vi.stubEnv("TRACE_USER_CONTENT_DOMAIN", "traceusercontent.test");

      const app = express();
      app.get("/parent", (_req, res) => {
        const address = server.address();
        if (!address || typeof address !== "object") {
          res.status(500).send("server address unavailable");
          return;
        }
        res.type("html").send(parentHarnessHtml(address.port));
      });
      app.use(handleDesignArtifactUserContent);

      const server = http.createServer(app);
      const port = await listen(server);

      try {
        const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "trace-design-parent-"));
        const { stdout } = await execFileAsync(
          chromeExecutable ?? "",
          [
            "--headless=new",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--no-first-run",
            "--no-default-browser-check",
            "--no-proxy-server",
            `--user-data-dir=${profileDir}`,
            `--host-resolver-rules=MAP *.traceusercontent.test 127.0.0.1`,
            "--virtual-time-budget=1000",
            "--dump-dom",
            `http://127.0.0.1:${port}/parent`,
          ],
          { maxBuffer: 10 * 1024 * 1024, timeout: 30_000 },
        ).finally(() => fs.rmSync(profileDir, { recursive: true, force: true }));

        expect(stdout).toContain("pending|ready");
        expect(stdout).toContain("|rendered:pins=1");
        expect(stdout).toContain("self-check:Browser rendered design artifact");
      } finally {
        await close(server);
      }
    },
    35_000,
  );

  runIfChrome(
    "renders published artifact HTML directly from the user-content artifact URL",
    async () => {
      vi.stubEnv("TRACE_USER_CONTENT_DOMAIN", "traceusercontent.test");
      prismaMock.artifact.findFirst.mockResolvedValue({
        html: `<!doctype html>
<html>
<body>
  <main data-el="published">Published artifact browser smoke</main>
  <script>document.body.setAttribute("data-published-executed", "yes");</script>
</body>
</html>`,
      });

      const app = express();
      app.use(handleDesignArtifactUserContent);
      const server = http.createServer(app);
      const port = await listen(server);

      try {
        const published = await dumpChromeDom({
          chromeExecutable: chromeExecutable ?? "",
          port,
          path: "/",
          profilePrefix: "trace-design-published-",
        });
        expect(published).toContain("Published artifact browser smoke");
        expect(published).toContain('data-published-executed="yes"');
        expect(published).not.toContain("trace:artifact:render");

        const bootstrap = await dumpChromeDom({
          chromeExecutable: chromeExecutable ?? "",
          port,
          path: "/_bootstrap",
          profilePrefix: "trace-design-published-bootstrap-",
        });
        expect(bootstrap).toContain("trace:artifact:render");
        expect(bootstrap).not.toContain("Published artifact browser smoke");
      } finally {
        await close(server);
      }
    },
    70_000,
  );
});
