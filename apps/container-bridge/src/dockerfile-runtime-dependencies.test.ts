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
});
