import { posix as path } from "node:path";
import { describe, expect, it } from "vitest";
import { handleListSkills, type BridgeFsLike, type BridgeMessage, type BridgePathLike } from "./bridge.js";

type Entry = { name: string; directory?: boolean; content?: string };

function createFs(entriesByDirectory: Record<string, Entry[]>): BridgeFsLike {
  const files = new Map<string, string>();
  for (const [directory, entries] of Object.entries(entriesByDirectory)) {
    for (const entry of entries) {
      if (!entry.directory && entry.content !== undefined) {
        files.set(path.join(directory, entry.name), entry.content);
      }
    }
  }

  return {
    readFile(filePath, callback) {
      const content = files.get(filePath);
      if (content === undefined) {
        callback(new Error(`Missing ${filePath}`), Buffer.alloc(0));
        return;
      }
      callback(null, Buffer.from(content));
    },
    promises: {
      async readdir(directory) {
        const entries = entriesByDirectory[directory];
        if (!entries) throw new Error(`Missing ${directory}`);
        return entries.map((entry) => ({
          name: entry.name,
          isDirectory: () => entry.directory === true,
          isFile: () => entry.directory !== true,
        }));
      },
      async realpath(directory) {
        return directory;
      },
      async stat() {
        return { size: 0, isFile: () => true };
      },
      async writeFile() {},
    },
  };
}

describe("handleListSkills", () => {
  it("discovers Claude and Codex user and project skills with stable precedence", async () => {
    const sent: BridgeMessage[] = [];
    await handleListSkills(
      {
        type: "list_skills",
        requestId: "request-1",
        sessionId: "session-1",
        workdirHint: "/workspace",
      },
      new Map(),
      (message) => sent.push(message),
      {
        userSkillsDirs: ["/home/user/.claude/skills", "/home/user/.codex/skills"],
        fs: createFs({
          "/home/user/.claude/skills": [
            { name: "review", directory: true },
            { name: "hidden", directory: true },
          ],
          "/home/user/.claude/skills/review": [
            { name: "SKILL.md", content: "---\nname: review\ndescription: Claude review\n---" },
          ],
          "/home/user/.claude/skills/hidden": [
            { name: "SKILL.md", content: "---\nuser-invocable: false\n---" },
          ],
          "/home/user/.codex/skills": [
            { name: "review", directory: true },
            { name: "deploy", directory: true },
          ],
          "/home/user/.codex/skills/review": [
            { name: "SKILL.md", content: "---\nname: review\ndescription: Codex review\n---" },
          ],
          "/home/user/.codex/skills/deploy": [
            { name: "SKILL.md", content: "---\nname: deploy\ndescription: Deploy app\n---" },
          ],
          "/workspace/.claude/skills": [{ name: "project-plan", directory: true }],
          "/workspace/.claude/skills/project-plan": [
            { name: "SKILL.md", content: "---\nname: project-plan\ndescription: Plan project\n---" },
          ],
          "/workspace/.codex/skills": [{ name: "project-test", directory: true }],
          "/workspace/.codex/skills/project-test": [
            { name: "SKILL.md", content: "---\nname: project-test\ndescription: Test project\n---" },
          ],
        }),
        path: path as BridgePathLike,
      },
    );

    expect(sent).toEqual([
      {
        type: "skills_result",
        requestId: "request-1",
        skills: [
          { name: "review", description: "Claude review", source: "user" },
          { name: "deploy", description: "Deploy app", source: "user" },
          { name: "project-plan", description: "Plan project", source: "project" },
          { name: "project-test", description: "Test project", source: "project" },
        ],
      },
    ]);
  });
});
