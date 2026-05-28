import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { repairNodePtySpawnHelpers } from "./node-pty-spawn-helper.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trace-node-pty-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("repairNodePtySpawnHelpers", () => {
  it("chmods unpacked node-pty spawn-helper files", () => {
    const root = makeTempDir();
    const helperDir = path.join(
      root,
      "app.asar.unpacked",
      "node_modules",
      "node-pty",
      "prebuilds",
      "darwin-arm64",
    );
    fs.mkdirSync(helperDir, { recursive: true });
    const helperPath = path.join(helperDir, "spawn-helper");
    fs.writeFileSync(helperPath, "");
    fs.chmodSync(helperPath, 0o644);

    const repaired = repairNodePtySpawnHelpers({ resourcesPath: root });

    expect(repaired).toBe(1);
    expect(fs.statSync(helperPath).mode & 0o777).toBe(0o755);
  });

  it("removes quarantine from unpacked node-pty spawn-helper files", () => {
    const root = makeTempDir();
    const helperDir = path.join(
      root,
      "app.asar.unpacked",
      "node_modules",
      "node-pty",
      "prebuilds",
      "darwin-arm64",
    );
    fs.mkdirSync(helperDir, { recursive: true });
    const helperPath = path.join(helperDir, "spawn-helper");
    fs.writeFileSync(helperPath, "");

    const quarantinedPaths: string[] = [];
    const repaired = repairNodePtySpawnHelpers({
      resourcesPath: root,
      deps: {
        readdirSync: fs.readdirSync,
        chmodSync: fs.chmodSync,
        copyFileSync: fs.copyFileSync,
        existsSync: fs.existsSync,
        removeQuarantineAttribute: (filePath) => quarantinedPaths.push(filePath),
      },
    });

    expect(repaired).toBe(1);
    expect(quarantinedPaths).toEqual([helperPath]);
  });

  it("ignores unrelated spawn-helper files", () => {
    const root = makeTempDir();
    const unrelatedDir = path.join(root, "app.asar.unpacked", "other-package");
    fs.mkdirSync(unrelatedDir, { recursive: true });
    const helperPath = path.join(unrelatedDir, "spawn-helper");
    fs.writeFileSync(helperPath, "");
    fs.chmodSync(helperPath, 0o644);

    const repaired = repairNodePtySpawnHelpers({ resourcesPath: root });

    expect(repaired).toBe(0);
    expect(fs.statSync(helperPath).mode & 0o777).toBe(0o644);
  });

  it("copies the active darwin helper next to rebuilt native modules", () => {
    const root = makeTempDir();
    const helperDir = path.join(
      root,
      "app.asar.unpacked",
      "node_modules",
      "node-pty",
      "prebuilds",
      `darwin-${process.arch}`,
    );
    const nativeDir = path.join(
      root,
      "app.asar.unpacked",
      "node_modules",
      "node-pty",
      "build",
      "Release",
    );
    fs.mkdirSync(helperDir, { recursive: true });
    fs.mkdirSync(nativeDir, { recursive: true });
    const helperPath = path.join(helperDir, "spawn-helper");
    const adjacentHelperPath = path.join(nativeDir, "spawn-helper");
    fs.writeFileSync(helperPath, "helper");
    fs.writeFileSync(path.join(nativeDir, "pty.node"), "");

    const repaired = repairNodePtySpawnHelpers({ resourcesPath: root });

    expect(repaired).toBe(2);
    expect(fs.readFileSync(adjacentHelperPath, "utf8")).toBe("helper");
    expect(fs.statSync(adjacentHelperPath).mode & 0o777).toBe(0o755);
  });
});
