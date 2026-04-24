import { describe, expect, it } from "vitest";
import {
  getActiveSlashCommandQuery,
  insertSlashCommand,
} from "./slashCommands";

describe("getActiveSlashCommandQuery", () => {
  it("detects a slash command at the cursor", () => {
    expect(
      getActiveSlashCommandQuery("/pla", { start: 4, end: 4 }),
    ).toEqual({
      query: "pla",
      range: { start: 0, end: 4 },
    });
  });

  it("replaces the full token when the cursor is inside it", () => {
    expect(
      getActiveSlashCommandQuery("/plan next", { start: 3, end: 3 }),
    ).toEqual({
      query: "pl",
      range: { start: 0, end: 5 },
    });
  });

  it("ignores slashes inside a non-command token", () => {
    expect(
      getActiveSlashCommandQuery("docs/foo", { start: 8, end: 8 }),
    ).toBeNull();
  });
});

describe("insertSlashCommand", () => {
  it("replaces the active token without duplicating existing whitespace", () => {
    expect(
      insertSlashCommand("/pla please", { start: 4, end: 4 }, "plan"),
    ).toEqual({
      text: "/plan please",
      selection: { start: 6, end: 6 },
    });
  });

  it("inserts at the cursor when no active slash token exists", () => {
    expect(
      insertSlashCommand("Tell me ", { start: 8, end: 8 }, "compact"),
    ).toEqual({
      text: "Tell me /compact ",
      selection: { start: 17, end: 17 },
    });
  });
});
