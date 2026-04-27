import { describe, expect, it } from "vitest";
import {
  assertValidCommitSha,
  extractGitToolUsePending,
  extractGitToolResultTrigger,
  isValidCommitSha,
  parseGitShowOutput,
  shortSha,
} from "@trace/shared";
import type { ToolOutput } from "@trace/shared";

describe("isValidCommitSha", () => {
  it("accepts a 7-char hex SHA", () => {
    expect(isValidCommitSha("abc1234")).toBe(true);
  });

  it("accepts a 40-char hex SHA", () => {
    expect(isValidCommitSha("abc1234567890abcdef1234567890abcdef1234")).toBe(true);
  });

  it("rejects too-short strings", () => {
    expect(isValidCommitSha("abc12")).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(isValidCommitSha("xyz1234")).toBe(false);
  });

  it("rejects strings with leading dashes (argument injection)", () => {
    expect(isValidCommitSha("--flag")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidCommitSha("")).toBe(false);
  });
});

describe("assertValidCommitSha", () => {
  it("does not throw for valid SHAs", () => {
    expect(() => assertValidCommitSha("abc1234")).not.toThrow();
  });

  it("throws for invalid SHAs", () => {
    expect(() => assertValidCommitSha("--flag")).toThrow("Invalid commit SHA");
  });
});

describe("shortSha", () => {
  it("returns the first 7 characters", () => {
    expect(shortSha("abc1234567890")).toBe("abc1234");
  });
});

describe("parseGitShowOutput", () => {
  it("parses valid git show output", () => {
    const show =
      "abc1234567890abcdef1234567890abcdef123456\nparent1 parent2\ntree123\nfeat: add feature\nTest Author <test@example.com>\n2024-01-01T00:00:00Z";
    const diff = "file1.ts\nfile2.ts\n";
    const result = parseGitShowOutput(
      show,
      diff,
      "commit",
      "git commit -m test",
      "2024-01-01T00:00:01Z",
    );

    expect(result.commitSha).toBe("abc1234567890abcdef1234567890abcdef123456");
    expect(result.parentShas).toEqual(["parent1", "parent2"]);
    expect(result.treeSha).toBe("tree123");
    expect(result.subject).toBe("feat: add feature");
    expect(result.author).toBe("Test Author <test@example.com>");
    expect(result.filesChanged).toBe(2);
    expect(result.trigger).toBe("commit");
  });

  it("throws on incomplete output", () => {
    expect(() =>
      parseGitShowOutput("", "", "commit", "git commit", "2024-01-01T00:00:00Z"),
    ).toThrow("Incomplete");
  });
});

describe("extractGitToolUsePending", () => {
  function makeToolUseOutput(blocks: Array<Record<string, unknown>>): ToolOutput {
    return {
      type: "assistant",
      message: { content: blocks },
    } as ToolOutput;
  }

  it("detects git commit in a Bash tool_use", () => {
    const output = makeToolUseOutput([
      { type: "tool_use", name: "Bash", id: "toolu_1", input: { command: "git commit -m 'test'" } },
    ]);
    const pending = extractGitToolUsePending(output);
    expect(pending.size).toBe(1);
    expect(pending.get("toolu_1")?.trigger).toBe("commit");
  });

  it("detects git push in a Bash tool_use", () => {
    const output = makeToolUseOutput([
      { type: "tool_use", name: "Bash", id: "toolu_2", input: { command: "git push origin main" } },
    ]);
    const pending = extractGitToolUsePending(output);
    expect(pending.get("toolu_2")?.trigger).toBe("push");
  });

  it("detects commit_and_push when both are in one command", () => {
    const output = makeToolUseOutput([
      {
        type: "tool_use",
        name: "Bash",
        id: "toolu_3",
        input: { command: "git commit -m 'x' && git push" },
      },
    ]);
    const pending = extractGitToolUsePending(output);
    expect(pending.get("toolu_3")?.trigger).toBe("commit_and_push");
  });

  it("ignores non-git commands", () => {
    const output = makeToolUseOutput([
      { type: "tool_use", name: "Bash", id: "toolu_4", input: { command: "npm test" } },
    ]);
    expect(extractGitToolUsePending(output).size).toBe(0);
  });

  it("ignores tool_use without id", () => {
    const output = makeToolUseOutput([
      { type: "tool_use", name: "Bash", input: { command: "git commit -m 'test'" } },
    ]);
    expect(extractGitToolUsePending(output).size).toBe(0);
  });
});

describe("extractGitToolResultTrigger", () => {
  function makeToolResultOutput(blocks: Array<Record<string, unknown>>): ToolOutput {
    return {
      type: "assistant",
      message: { content: blocks },
    } as ToolOutput;
  }

  it("matches a successful tool_result to a pending tool_use", () => {
    const pending = new Map([
      ["toolu_1", { trigger: "commit" as const, command: "git commit -m 'test'" }],
    ]);
    const output = makeToolResultOutput([
      {
        type: "tool_result",
        tool_use_id: "toolu_1",
        name: "Bash",
        content: "[main abc1234] test\n 1 file changed",
      },
    ]);
    const result = extractGitToolResultTrigger(output, pending);
    expect(result).not.toBeNull();
    expect(result?.trigger).toBe("commit");
    expect(result?.toolUseId).toBe("toolu_1");
  });

  it("skips tool_result with is_error=true", () => {
    const pending = new Map([
      ["toolu_1", { trigger: "commit" as const, command: "git commit -m 'test'" }],
    ]);
    const output = makeToolResultOutput([
      {
        type: "tool_result",
        tool_use_id: "toolu_1",
        name: "Bash",
        content: "fatal: not a git repository",
        is_error: true,
      },
    ]);
    const result = extractGitToolResultTrigger(output, pending);
    expect(result).toBeNull();
  });

  it("skips tool_result with fatal: in output", () => {
    const pending = new Map([
      ["toolu_1", { trigger: "commit" as const, command: "git commit -m 'test'" }],
    ]);
    const output = makeToolResultOutput([
      {
        type: "tool_result",
        tool_use_id: "toolu_1",
        name: "Bash",
        content: "fatal: pathspec 'foo' did not match any files",
      },
    ]);
    const result = extractGitToolResultTrigger(output, pending);
    expect(result).toBeNull();
  });

  it("skips tool_result with nothing to commit", () => {
    const pending = new Map([
      ["toolu_1", { trigger: "commit" as const, command: "git commit -m 'test'" }],
    ]);
    const output = makeToolResultOutput([
      {
        type: "tool_result",
        tool_use_id: "toolu_1",
        name: "Bash",
        content: "On branch main\nnothing to commit, working tree clean",
      },
    ]);
    const result = extractGitToolResultTrigger(output, pending);
    expect(result).toBeNull();
  });

  it("handles Codex-style content object with exitCode", () => {
    const output = makeToolResultOutput([
      {
        type: "tool_result",
        tool_use_id: "",
        name: "command",
        content: { command: "git commit -m 'test'", exitCode: 0, output: "done" },
      },
    ]);
    const result = extractGitToolResultTrigger(output, new Map());
    expect(result).not.toBeNull();
    expect(result?.trigger).toBe("commit");
  });

  it("rejects Codex-style with non-zero exitCode", () => {
    const output = makeToolResultOutput([
      {
        type: "tool_result",
        tool_use_id: "",
        name: "command",
        content: { command: "git commit -m 'test'", exitCode: 1, output: "error" },
      },
    ]);
    const result = extractGitToolResultTrigger(output, new Map());
    expect(result).toBeNull();
  });
});
