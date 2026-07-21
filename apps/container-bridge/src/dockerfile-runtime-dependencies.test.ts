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
});
