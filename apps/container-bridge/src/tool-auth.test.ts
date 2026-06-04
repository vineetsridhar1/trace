import { EventEmitter } from "events";
import { spawn } from "child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("child_process", () => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock("@trace/shared/adapters", () => ({
  buildChildProcessEnv: () => process.env,
}));

const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>;

type FakeChild = EventEmitter & {
  stdin: {
    on: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
  stdout: EventEmitter;
  stderr: EventEmitter;
};

function mockCodexLogin(code = 0) {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = {
    on: vi.fn(),
    end: vi.fn(() => {
      queueMicrotask(() => child.emit("close", code));
    }),
  };
  spawnMock.mockReturnValueOnce(child);
  return child;
}

async function importToolAuth() {
  vi.resetModules();
  return import("./tool-auth.js");
}

describe("tool auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CODEX_ACCESS_TOKEN;
    delete process.env.OPENAI_API_KEY;
  });

  it("prefers Codex access-token login over API-key login", async () => {
    process.env.CODEX_ACCESS_TOKEN = "codex-access-token";
    process.env.OPENAI_API_KEY = "openai-api-key";
    const child = mockCodexLogin();
    const { ensureToolReady } = await importToolAuth();

    await ensureToolReady("codex");

    expect(spawnMock).toHaveBeenCalledWith(
      "codex",
      ["login", "--with-access-token"],
      expect.objectContaining({ stdio: ["pipe", "pipe", "pipe"] }),
    );
    expect(child.stdin.end).toHaveBeenCalledWith("codex-access-token");
  });

  it("falls back to Codex API-key login", async () => {
    process.env.OPENAI_API_KEY = "openai-api-key";
    const child = mockCodexLogin();
    const { ensureToolReady } = await importToolAuth();

    await ensureToolReady("codex");

    expect(spawnMock).toHaveBeenCalledWith(
      "codex",
      ["login", "--with-api-key"],
      expect.objectContaining({ stdio: ["pipe", "pipe", "pipe"] }),
    );
    expect(child.stdin.end).toHaveBeenCalledWith("openai-api-key");
  });

  it("reports a clear error when Codex has no credential", async () => {
    const { ensureToolReady } = await importToolAuth();

    await expect(ensureToolReady("codex")).rejects.toThrow(
      "Connect a Codex access token in Settings or provide OPENAI_API_KEY in the runtime environment.",
    );
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
