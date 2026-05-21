import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalProjectOnDisk, type CreateLocalProjectDeps } from "./local-project.js";

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "trace-local-project-"));
  tempRoots.push(root);
  return root;
}

function makeDeps(execFile = vi.fn().mockResolvedValue(undefined)): CreateLocalProjectDeps {
  return {
    readdir: fs.promises.readdir,
    mkdir: fs.promises.mkdir,
    execFile,
  };
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("createLocalProjectOnDisk", () => {
  it("creates a folder and initializes git on main", async () => {
    const root = makeTempRoot();
    const execFile = vi.fn().mockResolvedValue(undefined);

    await expect(
      createLocalProjectOnDisk({ name: "demo", parentPath: root }, makeDeps(execFile)),
    ).resolves.toEqual({
      name: "demo",
      path: path.join(root, "demo"),
      remoteUrl: null,
      defaultBranch: "main",
    });

    expect(fs.existsSync(path.join(root, "demo"))).toBe(true);
    expect(execFile).toHaveBeenCalledWith(["init", "-b", "main"], path.join(root, "demo"));
    expect(execFile).toHaveBeenCalledWith(
      [
        "-c",
        "user.name=Trace",
        "-c",
        "user.email=trace@localhost",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "--allow-empty",
        "-m",
        "Initial commit",
      ],
      path.join(root, "demo"),
    );
  });

  it("uses the fallback branch setup when git init -b is unavailable", async () => {
    const root = makeTempRoot();
    const execFile = vi
      .fn()
      .mockRejectedValueOnce(new Error("unknown switch b"))
      .mockResolvedValue(undefined);

    await createLocalProjectOnDisk({ name: "demo", parentPath: root }, makeDeps(execFile));

    expect(execFile).toHaveBeenNthCalledWith(1, ["init", "-b", "main"], path.join(root, "demo"));
    expect(execFile).toHaveBeenNthCalledWith(2, ["init"], path.join(root, "demo"));
    expect(execFile).toHaveBeenNthCalledWith(
      3,
      ["symbolic-ref", "HEAD", "refs/heads/main"],
      path.join(root, "demo"),
    );
    expect(execFile).toHaveBeenNthCalledWith(
      4,
      [
        "-c",
        "user.name=Trace",
        "-c",
        "user.email=trace@localhost",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "--allow-empty",
        "-m",
        "Initial commit",
      ],
      path.join(root, "demo"),
    );
  });

  it("rejects non-empty existing folders", async () => {
    const root = makeTempRoot();
    const projectPath = path.join(root, "demo");
    fs.mkdirSync(projectPath);
    fs.writeFileSync(path.join(projectPath, "README.md"), "hello\n");

    await expect(
      createLocalProjectOnDisk({ name: "demo", parentPath: root }, makeDeps()),
    ).rejects.toThrow("A non-empty folder already exists at that location.");
  });

  it("rejects path separators in the project name", async () => {
    const root = makeTempRoot();

    await expect(
      createLocalProjectOnDisk({ name: "../demo", parentPath: root }, makeDeps()),
    ).rejects.toThrow("Project name cannot contain path separators.");
  });
});
