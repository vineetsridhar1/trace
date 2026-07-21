import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { designSystemCommitStorageKey, designSystemVersionStorageKey } from "@trace/shared";
import { materializeDesignSystemPackage } from "../../../container-bridge/src/design-system-package.js";
import {
  createDeterministicTarGz,
  packageFilesFromWorkbench,
  parseGitTreeArchive,
  validateWorkbenchPackage,
} from "../lib/design-system-archive.js";
import { LocalGitStorageAdapter } from "../lib/git-storage/local-adapter.js";
import { LocalStorageAdapter } from "../lib/storage/local-adapter.js";

const exec = promisify(execFile);
const roots: string[] = [];

async function writePackage(worktree: string, accent: string): Promise<void> {
  const root = path.join(worktree, "design-system");
  await mkdir(path.join(root, "components"), { recursive: true });
  await mkdir(path.join(root, "preview"), { recursive: true });
  await mkdir(path.join(root, "source"), { recursive: true });
  await writeFile(
    path.join(root, "manifest.json"),
    JSON.stringify({
      schemaVersion: "trace-design-system/v1",
      id: "fixture",
      name: "Fixture UI",
      description: "Fixture product language",
      platforms: ["web"],
      files: {
        guidance: "DESIGN.md",
        tokens: "tokens.css",
        components: "components.manifest.json",
        evidence: "source/evidence.json",
      },
      componentsDirectory: "components",
      assetsDirectory: "assets",
      previewDirectory: "preview",
    }),
  );
  await writeFile(
    path.join(root, "DESIGN.md"),
    "# Fixture UI\nUse semantic tokens, visible focus, and complete interaction states.",
  );
  await writeFile(
    path.join(root, "tokens.css"),
    `:root { --background:#fff; --surface:#eee; --foreground:#111; --muted-foreground:#555; --border:#ccc; --accent:${accent}; --accent-foreground:#fff; --destructive:#c00; --success:#080; --warning:#a60; --font-sans:system-ui; --text-base:1rem; --space-1:.25rem; --radius:.5rem; --shadow:0 1px 2px #0003; --focus-ring:0 0 0 2px ${accent}; --motion-duration:150ms; }`,
  );
  await writeFile(
    path.join(root, "components.manifest.json"),
    JSON.stringify({
      components: [
        {
          name: "Button",
          category: "actions",
          reuseMode: "portable",
          entry: "components/Button.tsx",
          sourcePaths: ["src/Button.tsx"],
          exportNames: ["Button"],
          variants: ["primary"],
          sizes: ["md"],
          states: ["default", "hover", "focus", "disabled", "loading"],
          tokenDependencies: ["accent"],
          assetDependencies: [],
          accessibility: "Visible focus",
          interaction: "Submit action",
          confidence: "high",
          limitations: [],
        },
      ],
    }),
  );
  await writeFile(
    path.join(root, "components/Button.tsx"),
    "export function Button({ children }: { children: string }) { return <button>{children}</button>; }",
  );
  await writeFile(
    path.join(root, "preview/foundations.html"),
    "<!doctype html><html><body><main><h1>Foundations</h1><p>Colors typography spacing radius focus and motion.</p></main></body></html>",
  );
  await writeFile(
    path.join(root, "preview/components.html"),
    "<!doctype html><html><body><main><h1>Components</h1><button>Primary default</button><button disabled>Primary disabled</button><p>primary md hover focus loading</p></main></body></html>",
  );
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  await writeFile(path.join(root, "preview/foundations.png"), png);
  await writeFile(path.join(root, "preview/components.png"), png);
  await writeFile(
    path.join(root, "source/evidence.json"),
    JSON.stringify({
      sourceCommit: "source-commit-1",
      evidence: [{ decision: "accent", files: ["src/tokens.css"] }],
    }),
  );
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("design-system local lifecycle e2e", () => {
  it("archives every commit, publishes an immutable version, and materializes the pinned package", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "trace-design-system-e2e-"));
    roots.push(root);
    const git = new LocalGitStorageAdapter(path.join(root, "git"));
    const bare = await git.initBareRepo("org-1", "managed-repo-1", { defaultBranch: "main" });
    const worktree = path.join(root, "workbench");
    await exec("git", ["clone", bare, worktree]);
    await exec("git", ["config", "user.name", "Trace Fixture"], { cwd: worktree });
    await exec("git", ["config", "user.email", "fixture@trace.local"], { cwd: worktree });

    await writePackage(worktree, "#064");
    await exec("git", ["add", "."], { cwd: worktree });
    await exec("git", ["commit", "-m", "initial design system"], { cwd: worktree });
    await exec("git", ["push", "origin", "main"], { cwd: worktree });
    const commit1 = (await exec("git", ["rev-parse", "HEAD"], { cwd: worktree })).stdout.trim();

    await writePackage(worktree, "#075");
    await exec("git", ["add", "."], { cwd: worktree });
    await exec("git", ["commit", "-m", "adjust accent"], { cwd: worktree });
    await exec("git", ["push", "origin", "main"], { cwd: worktree });
    const commit2 = (await exec("git", ["rev-parse", "HEAD"], { cwd: worktree })).stdout.trim();
    expect(
      await git.listCommitsBetween("org-1", "managed-repo-1", "0".repeat(40), commit2),
    ).toEqual([commit1, commit2]);

    vi.stubEnv("LOCAL_STORAGE_DIR", path.join(root, "objects"));
    const storage = new LocalStorageAdapter();
    const artifacts: Buffer[] = [];
    for (const commit of [commit1, commit2]) {
      const tree = await parseGitTreeArchive(
        await git.archiveTreeAtCommit("org-1", "managed-repo-1", commit),
      );
      const validation = validateWorkbenchPackage(tree.files);
      expect(validation.errors).toEqual([]);
      expect(validation.valid).toBe(true);
      const artifact = await createDeterministicTarGz(tree.files);
      artifacts.push(artifact);
      const key = designSystemCommitStorageKey("org-1", "system-1", commit);
      await storage.putObject(key, artifact, "application/gzip");
      await expect(storage.getObject(key)).resolves.toEqual(artifact);
    }

    const firstTree = await parseGitTreeArchive(
      await git.archiveTreeAtCommit("org-1", "managed-repo-1", commit1),
    );
    const packageFiles = new Map(
      [...packageFilesFromWorkbench(firstTree.files)].map(([name, body]) => [
        `design-system/${name}`,
        body,
      ]),
    );
    const versionArchive = await createDeterministicTarGz(packageFiles);
    const versionKey = designSystemVersionStorageKey("org-1", "system-1", "version-1");
    await storage.putObject(versionKey, versionArchive, "application/gzip");

    const designWorkspace = path.join(root, "design");
    await mkdir(designWorkspace);
    await materializeDesignSystemPackage(designWorkspace, {
      versionId: "version-1",
      downloadUrl: `data:application/gzip;base64,${versionArchive.toString("base64")}`,
      contentDigest: createHash("sha256").update(versionArchive).digest("hex"),
      byteSize: versionArchive.byteLength,
    });
    expect(
      await readFile(path.join(designWorkspace, "design-system/tokens.css"), "utf8"),
    ).toContain("--accent:#064");
    const secondTree = await parseGitTreeArchive(
      await git.archiveTreeAtCommit("org-1", "managed-repo-1", commit2),
    );
    expect(secondTree.files.get("design-system/tokens.css")?.toString("utf8")).toContain(
      "--accent:#075",
    );
    expect(await storage.getObject(versionKey)).toEqual(versionArchive);
  });
});
