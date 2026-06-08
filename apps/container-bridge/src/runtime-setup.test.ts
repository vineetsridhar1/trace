import { describe, expect, it } from "vitest";
import { parseRuntimeSetupCommands } from "./runtime-setup.js";

describe("runtime setup commands", () => {
  it("parses JSON command arrays", () => {
    expect(parseRuntimeSetupCommands('["npm install -g foo", "pipx install bar"]')).toEqual([
      "npm install -g foo",
      "pipx install bar",
    ]);
  });

  it("parses newline-separated commands", () => {
    expect(parseRuntimeSetupCommands("npm install -g foo\n\npipx install bar")).toEqual([
      "npm install -g foo",
      "pipx install bar",
    ]);
  });

  it("rejects non-string JSON arrays", () => {
    expect(() => parseRuntimeSetupCommands('["npm install -g foo", 1]')).toThrow(
      "TRACE_RUNTIME_SETUP_COMMANDS must be a JSON array of strings",
    );
  });
});
