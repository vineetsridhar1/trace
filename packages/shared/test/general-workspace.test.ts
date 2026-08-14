import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generalWorkspacePath, removeGeneralWorkspace } from "../src/general-workspace.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.promises.rm(dir, { recursive: true })));
});

async function makeHome(): Promise<string> {
  const home = await fs.promises.mkdtemp(path.join(os.tmpdir(), "trace-general-workspace-"));
  tempDirs.push(home);
  return home;
}

describe("removeGeneralWorkspace", () => {
  it("reconstructs the deterministic path after a bridge restart", async () => {
    const home = await makeHome();
    const workdir = generalWorkspacePath("group-1", home);
    await fs.promises.mkdir(workdir, { recursive: true });
    await fs.promises.writeFile(path.join(workdir, "temporary.txt"), "temporary");

    await expect(removeGeneralWorkspace(undefined, "group-1", home)).resolves.toBe(true);
    await expect(fs.promises.stat(workdir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes the matching managed general workspace", async () => {
    const home = await makeHome();
    const workdir = generalWorkspacePath("group-1", home);
    await fs.promises.mkdir(workdir, { recursive: true });
    await fs.promises.writeFile(path.join(workdir, "temporary.txt"), "temporary");

    await expect(removeGeneralWorkspace(workdir, "group-1", home)).resolves.toBe(true);
    await expect(fs.promises.stat(workdir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses to remove a path outside the matching general workspace", async () => {
    const home = await makeHome();
    const unrelated = path.join(home, "projects", "important");
    await fs.promises.mkdir(unrelated, { recursive: true });

    await expect(removeGeneralWorkspace(unrelated, "group-1", home)).resolves.toBe(false);
    await expect(fs.promises.stat(unrelated)).resolves.toBeDefined();
  });

  it("refuses a session key that escapes the managed root", async () => {
    const home = await makeHome();
    const outside = path.join(home, "trace", "outside");
    await fs.promises.mkdir(outside, { recursive: true });

    await expect(removeGeneralWorkspace(outside, "../outside", home)).resolves.toBe(false);
    await expect(fs.promises.stat(outside)).resolves.toBeDefined();
  });
});
