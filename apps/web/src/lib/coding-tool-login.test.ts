import { beforeEach, describe, expect, it, vi } from "vitest";
import { CREATE_TERMINAL_MUTATION } from "@trace/client-core";

const mocks = vi.hoisted(() => ({
  mutation: vi.fn(),
  addTerminal: vi.fn(),
  setActiveSessionId: vi.fn(),
  setActiveTerminalId: vi.fn(),
  setShowTerminalPanel: vi.fn(),
}));

vi.mock("./urql", () => ({
  client: { mutation: mocks.mutation },
}));

vi.mock("../stores/terminal", () => ({
  useTerminalStore: {
    getState: () => ({ addTerminal: mocks.addTerminal }),
  },
}));

vi.mock("../stores/ui", () => ({
  useUIStore: {
    getState: () => ({
      setActiveSessionId: mocks.setActiveSessionId,
      setActiveTerminalId: mocks.setActiveTerminalId,
      setShowTerminalPanel: mocks.setShowTerminalPanel,
    }),
  },
}));

import { getToolLoginTerminal, openToolLoginTerminal } from "./coding-tool-login";

describe("coding tool login terminals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["claude_code", "Claude Login", "claude\n/login"],
    ["pi", "Pi Login", "pi\n/login"],
    ["codex", "Codex Login", "codex login"],
    ["cursor_composer", "Cursor Login", "cursor-agent login"],
  ])("primes the %s login flow", (tool, terminalName, initialCommand) => {
    expect(getToolLoginTerminal(tool)).toEqual({ terminalName, initialCommand });
  });

  it("does not invent a login flow for an unsupported tool", () => {
    expect(getToolLoginTerminal("unknown")).toBeUndefined();
  });

  it("creates, registers, and reveals the login terminal", async () => {
    const toPromise = vi.fn().mockResolvedValue({ data: { createTerminal: { id: "terminal-1" } } });
    mocks.mutation.mockReturnValue({ toPromise });
    const login = getToolLoginTerminal("claude_code");
    expect(login).toBeDefined();

    await openToolLoginTerminal("session-1", "group-1", login!);

    expect(mocks.mutation).toHaveBeenCalledWith(CREATE_TERMINAL_MUTATION, {
      sessionId: "session-1",
      cols: 80,
      rows: 24,
    });
    expect(mocks.addTerminal).toHaveBeenCalledWith(
      "terminal-1",
      "session-1",
      "group-1",
      "connecting",
      {
        customName: "Claude Login",
        initialCommand: "claude\n/login",
        submitInitialCommand: false,
      },
    );
    expect(mocks.setActiveSessionId).toHaveBeenCalledWith("session-1");
    expect(mocks.setActiveTerminalId).toHaveBeenCalledWith("terminal-1");
    expect(mocks.setShowTerminalPanel).toHaveBeenCalledWith(true);
  });

  it("does not change local UI state when terminal creation fails", async () => {
    const error = new Error("Terminal unavailable");
    mocks.mutation.mockReturnValue({
      toPromise: vi.fn().mockResolvedValue({ error }),
    });
    const login = getToolLoginTerminal("claude_code");
    expect(login).toBeDefined();

    await expect(openToolLoginTerminal("session-1", "group-1", login!)).rejects.toBe(error);

    expect(mocks.addTerminal).not.toHaveBeenCalled();
    expect(mocks.setActiveSessionId).not.toHaveBeenCalled();
    expect(mocks.setActiveTerminalId).not.toHaveBeenCalled();
    expect(mocks.setShowTerminalPanel).not.toHaveBeenCalled();
  });
});
