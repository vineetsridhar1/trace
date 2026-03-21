import { describe, expect, it, vi } from "vitest";
import { runtimeDebug } from "./runtime-debug.js";

describe("runtimeDebug", () => {
  it("logs a plain message", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    runtimeDebug("hello");

    expect(logSpy).toHaveBeenCalledWith("[runtime-debug] hello");
  });

  it("logs structured data when provided", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    runtimeDebug("hello", { sessionId: "s-1" });

    expect(logSpy).toHaveBeenCalledWith("[runtime-debug] hello", { sessionId: "s-1" });
  });
});
