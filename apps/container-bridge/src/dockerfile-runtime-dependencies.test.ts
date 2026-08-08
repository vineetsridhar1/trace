import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("container runtime dependencies", () => {
  it("installs every external bridge dependency in the standalone image", async () => {
    const [dockerfile, packageJson] = await Promise.all([
      readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
      readFile(new URL("../package.json", import.meta.url), "utf8").then(
        (value) => JSON.parse(value) as { dependencies: Record<string, string> },
      ),
    ]);
    const installCommand = dockerfile.match(/npm init -y && npm install ([^&\n]+)/)?.[1] ?? "";
    const installed = new Set(installCommand.trim().split(/\s+/));
    const externalDependencies = Object.keys(packageJson.dependencies).filter(
      (name) => !name.startsWith("@trace/"),
    );

    expect(externalDependencies.filter((name) => !installed.has(name))).toEqual([]);
  });

  it("creates every bridge workspace root for the non-root runtime user", async () => {
    const dockerfile = await readFile(new URL("../Dockerfile", import.meta.url), "utf8");
    const created = new Set(
      (dockerfile.match(/mkdir -p ([^&\n]+)/)?.[1] ?? "").trim().split(/\s+/),
    );
    const owned = new Set(
      (dockerfile.match(/chown -R coder:coder ([^&\n]+)/)?.[1] ?? "").trim().split(/\s+/),
    );

    for (const root of ["/workspace", "/repos", "/workspaces", "/sources"]) {
      expect(created.has(root), `${root} must be created`).toBe(true);
      expect(owned.has(root), `${root} must be owned by coder`).toBe(true);
    }
  });

  it("declares the runtime-managed skills path for cloud sessions", async () => {
    const dockerfile = await readFile(new URL("../Dockerfile", import.meta.url), "utf8");

    expect(dockerfile).toContain("ENV TRACE_SKILLS_DIR=/trace/runtime/skills/");
    expect(dockerfile).not.toContain("COPY runtime/skills/ /trace/runtime/skills/");
  });

  it("pins and smoke-tests the browser video runtime without session-time downloads", async () => {
    const [dockerfile, dockerignore, config] = await Promise.all([
      readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
      readFile(new URL("../../../.dockerignore", import.meta.url), "utf8"),
      readFile(new URL("../playwright-cli.config.json", import.meta.url), "utf8").then(
        (value) =>
          JSON.parse(value) as {
            browser: {
              isolated: boolean;
              launchOptions: { executablePath: string; headless: boolean };
            };
            allowUnrestrictedFileAccess: boolean;
          },
      ),
    ]);

    expect(dockerfile).toContain("@playwright/cli@0.1.18");
    expect(dockerfile).toContain("playwright@1.63.0-alpha-2026-08-05");
    expect(dockerfile).toContain("playwright install ffmpeg");
    expect(dockerfile).toContain(
      "COPY apps/container-bridge/playwright-cli.config.json /opt/trace/playwright-cli.config.json",
    );
    expect(dockerfile).toContain("playwright-cli video-start");
    expect(dockerfile).toContain("playwright-cli video-stop");
    expect(dockerfile).toContain('test -s "$smoke_dir/smoke.webm"');
    expect(dockerignore).toContain("!apps/container-bridge/playwright-cli.config.json");
    expect(config.browser.isolated).toBe(true);
    expect(config.browser.launchOptions).toEqual(
      expect.objectContaining({ executablePath: "/usr/bin/chromium", headless: true }),
    );
    expect(config.allowUnrestrictedFileAccess).toBe(false);
  });
});
