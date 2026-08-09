import { describe, expect, it } from "vitest";
import { CliError } from "../src/errors.js";
import {
  assertCommandDefinitions,
  assertCommandGroups,
  defineCommand,
  parseCommandInput,
  parseGlobalOptions,
} from "../src/runtime.js";

const command = defineCommand({
  path: ["thing", "run"],
  description: "Run a thing",
  positionals: [{ name: "message", variadic: true }],
  options: [
    { name: "force", flag: "--force", kind: "boolean", description: "Force it" },
    {
      name: "limit",
      flag: "--limit",
      kind: "integer",
      valueName: "N",
      min: 1,
      max: 5,
      description: "Limit",
    },
    {
      name: "mode",
      flag: "--mode",
      kind: "string",
      valueName: "MODE",
      choices: ["safe", "fast"],
      description: "Mode",
    },
  ],
  async run() {},
});

describe("declarative command runtime", () => {
  it("parses typed options, equals syntax, and variadic positionals", () => {
    const input = parseCommandInput(command, [
      "thing",
      "run",
      "hello",
      "--force",
      "--limit=3",
      "--mode",
      "safe",
      "world",
    ]);
    expect(input.options).toEqual({ force: true, limit: 3, mode: "safe" });
    expect(input.positionals).toEqual(["hello", "world"]);
    expect([...input.providedOptions]).toEqual(["force", "limit", "mode"]);
  });

  it("supports an option terminator", () => {
    const global = parseGlobalOptions(["thing", "run", "--", "--json"]);
    expect(global.options.json).toBe(false);
    expect(parseCommandInput(command, global.args).positionals).toEqual(["--json"]);
  });

  it("does not interpret help after the option terminator", () => {
    const global = parseGlobalOptions(["thing", "run", "--", "--help"]);
    expect(global.help).toBe(false);
    expect(parseCommandInput(command, global.args).positionals).toEqual(["--help"]);
  });

  it.each([
    [["thing", "run", "--limit", "0"], "--limit must be at least 1"],
    [["thing", "run", "--mode", "unsafe"], "--mode must be one of: safe, fast"],
    [["thing", "run", "--force", "--force"], "--force may only be provided once"],
    [["thing", "run", "--unknown"], "Unknown option: --unknown"],
  ])("rejects invalid input", (argv, message) => {
    expect(() => parseCommandInput(command, argv)).toThrowError(
      expect.objectContaining<Partial<CliError>>({ message }),
    );
  });

  it("rejects invalid command registries", () => {
    expect(() => assertCommandDefinitions([command, command])).toThrow("Duplicate");
    expect(() => assertCommandGroups([], [command])).toThrow("no registered group");
    expect(() => assertCommandGroups([{ name: "thing", description: "Things" }], [])).toThrow(
      "no subcommands",
    );
  });
});
