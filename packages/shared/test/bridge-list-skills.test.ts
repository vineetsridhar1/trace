import fs from "fs";
import os from "os";
import path from "path";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import type { BridgeMessage } from "../src/bridge.js";
import { handleListSkills } from "../src/bridge.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("handleListSkills", () => {
  it("lists Trace runtime skills supplied as user skills", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "trace-skills-"));
    temporaryDirectories.push(root);
    const skillsDir = path.join(root, "skills");
    const skillDir = path.join(skillsDir, "request-user-input");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      path.join(skillDir, "SKILL.md"),
      [
        "---",
        "name: request-user-input",
        "description: Ask users through Trace's structured question UI.",
        "---",
        "",
        "# Request User Input",
      ].join("\n"),
      "utf8",
    );

    const messages: BridgeMessage[] = [];
    await handleListSkills(
      {
        type: "list_skills",
        requestId: "request-1",
        sessionId: "session-1",
        includeProjectSkills: false,
      },
      new Map(),
      (message) => messages.push(message),
      { userSkillsDir: skillsDir, fs, path },
    );

    expect(messages).toEqual([
      {
        type: "skills_result",
        requestId: "request-1",
        skills: [
          {
            name: "request-user-input",
            description: "Ask users through Trace's structured question UI.",
            source: "user",
          },
        ],
      },
    ]);
  });
});
