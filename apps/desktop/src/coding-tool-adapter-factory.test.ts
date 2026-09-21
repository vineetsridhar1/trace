import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawn } from "child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCodingToolAdapter, getSupportedCodingTools } from "./coding-tool-adapter-factory.js";
import { CodingToolExecutableRegistry } from "./coding-tool-executables.js";

class FakeChildProcess extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  pid = 12345;
}

vi.mock("child_process", () => ({
  spawn: vi.fn(() => new FakeChildProcess()),
}));

describe("desktop coding tool resolution", () => {
  beforeEach(() => {
    vi.mocked(spawn).mockClear();
  });

  it("advertises and launches the same absolute login-shell executable", async () => {
    let executablePath = "/Users/example/.nvm/versions/node/v22/bin/claude";
    const registry = new CodingToolExecutableRegistry({
      hydratePath: async () => ({ loaded: true, error: null }),
      readOverrides: () => ({}),
      resolveCommand: (command) => (command === "claude" ? executablePath : null),
      isExecutable: () => true,
      warn: vi.fn(),
    });
    await registry.refresh();

    expect(getSupportedCodingTools(registry)).toEqual(["custom", "claude_code"]);

    const adapter = createCodingToolAdapter("claude_code", registry);
    adapter.run({
      prompt: "hello",
      cwd: "/tmp",
      onOutput: vi.fn(),
      onComplete: vi.fn(),
    });
    expect(spawn).toHaveBeenCalledWith(
      "/Users/example/.nvm/versions/node/v22/bin/claude",
      expect.any(Array),
      expect.any(Object),
    );

    executablePath = "/Users/example/.nvm/versions/node/v24/bin/claude";
    await registry.refresh();
    adapter.run({
      prompt: "hello again",
      cwd: "/tmp",
      onOutput: vi.fn(),
      onComplete: vi.fn(),
    });
    expect(spawn).toHaveBeenLastCalledWith(
      "/Users/example/.nvm/versions/node/v24/bin/claude",
      expect.any(Array),
      expect.any(Object),
    );
  });
});
