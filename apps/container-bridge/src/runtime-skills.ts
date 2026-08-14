import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

const CODING_TOOL_SKILL_DIRECTORIES = [".claude/skills", ".codex/skills"] as const;

export async function installRuntimeSkillsForCodingTools(
  runtimeSkillsDir: string,
  homeDir: string,
): Promise<string[]> {
  const entries = await readdir(runtimeSkillsDir, { withFileTypes: true });
  const skillNames: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillFile = join(runtimeSkillsDir, entry.name, "SKILL.md");
    const isSkill = await stat(skillFile)
      .then((value) => value.isFile())
      .catch(() => false);
    if (isSkill) skillNames.push(entry.name);
  }

  skillNames.sort();
  for (const relativeDirectory of CODING_TOOL_SKILL_DIRECTORIES) {
    const toolSkillsDir = join(homeDir, relativeDirectory);
    await mkdir(toolSkillsDir, { recursive: true });
    for (const skillName of skillNames) {
      const destination = join(toolSkillsDir, skillName);
      await rm(destination, { recursive: true, force: true });
      await cp(join(runtimeSkillsDir, skillName), destination, { recursive: true });
    }
  }

  return skillNames;
}
