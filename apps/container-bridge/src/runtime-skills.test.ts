import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installRuntimeSkillsForCodingTools } from "./runtime-skills.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("runtime skill installation", () => {
  it("installs current Trace skills into Claude and Codex discovery directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "trace-runtime-skills-test-"));
    temporaryDirectories.push(root);
    const runtimeSkillsDir = join(root, "runtime-skills");
    const homeDir = join(root, "home");

    await mkdir(join(runtimeSkillsDir, "browser-video", "agents"), { recursive: true });
    await writeFile(join(runtimeSkillsDir, "browser-video", "SKILL.md"), "current skill");
    await writeFile(
      join(runtimeSkillsDir, "browser-video", "agents", "openai.yaml"),
      "display_name: Browser Video",
    );
    await mkdir(join(runtimeSkillsDir, "not-a-skill"), { recursive: true });
    await mkdir(join(homeDir, ".codex", "skills", "browser-video"), { recursive: true });
    await writeFile(join(homeDir, ".codex", "skills", "browser-video", "SKILL.md"), "stale skill");
    await mkdir(join(homeDir, ".codex", "skills", "user-skill"), { recursive: true });
    await writeFile(join(homeDir, ".codex", "skills", "user-skill", "SKILL.md"), "user skill");

    await expect(installRuntimeSkillsForCodingTools(runtimeSkillsDir, homeDir)).resolves.toEqual([
      "browser-video",
    ]);

    for (const tool of [".claude", ".codex"]) {
      await expect(
        readFile(join(homeDir, tool, "skills", "browser-video", "SKILL.md"), "utf8"),
      ).resolves.toBe("current skill");
      await expect(
        readFile(join(homeDir, tool, "skills", "browser-video", "agents", "openai.yaml"), "utf8"),
      ).resolves.toContain("Browser Video");
    }
    await expect(
      readFile(join(homeDir, ".codex", "skills", "user-skill", "SKILL.md"), "utf8"),
    ).resolves.toBe("user skill");
  });
});
