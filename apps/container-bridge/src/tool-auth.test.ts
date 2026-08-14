import { EventEmitter } from "events";
import { spawn } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("child_process", () => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock("@trace/shared/adapters", () => ({
  buildChildProcessEnv: () => process.env,
}));

const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>;
let codexHome: string;

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
    codexHome = mkdtempSync(join(tmpdir(), "trace-codex-auth-test-"));
    process.env.CODEX_HOME = codexHome;
    delete process.env.CODEX_AUTH_METHOD;
    delete process.env.CODEX_ACCESS_TOKEN;
    delete process.env.CODEX_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    delete process.env.CODEX_HOME;
    rmSync(codexHome, { recursive: true, force: true });
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
      expect.objectContaining({ stdio: ["pipe", "ignore", "pipe"] }),
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
      expect.objectContaining({ stdio: ["pipe", "ignore", "pipe"] }),
    );
    expect(child.stdin.end).toHaveBeenCalledWith("openai-api-key");
  });

  it("treats an empty Codex access token as absent and falls back to API-key login", async () => {
    process.env.CODEX_ACCESS_TOKEN = "";
    process.env.OPENAI_API_KEY = "openai-api-key";
    const child = mockCodexLogin();
    const { ensureToolReady } = await importToolAuth();

    await ensureToolReady("codex");

    expect(spawnMock).toHaveBeenCalledWith(
      "codex",
      ["login", "--with-api-key"],
      expect.objectContaining({ stdio: ["pipe", "ignore", "pipe"] }),
    );
    expect(child.stdin.end).toHaveBeenCalledWith("openai-api-key");
  });

  it("includes Codex's stderr in the login failure, with the token redacted", async () => {
    process.env.OPENAI_API_KEY = "openai-api-key";
    const child = mockCodexLogin(1);
    const { ensureToolReady } = await importToolAuth();

    const ready = ensureToolReady("codex");
    child.stderr.emit("data", Buffer.from("unsupported flag; key openai-api-key rejected\n"));

    await expect(ready).rejects.toThrow(
      "codex login exited 1: unsupported flag; key [redacted] rejected",
    );
  });

  it("reports a clear error when Codex has no credential", async () => {
    const { ensureToolReady } = await importToolAuth();

    await expect(ensureToolReady("codex")).rejects.toThrow(
      "add a ChatGPT session, Codex access token, or OpenAI API key in Settings",
    );
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
