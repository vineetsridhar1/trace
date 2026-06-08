import { describe, expect, it } from "vitest";
import { parseEnvSecrets } from "./parse-env-secrets";

describe("parseEnvSecrets", () => {
  it("parses common dotenv entries", () => {
    expect(
      parseEnvSecrets(`
# comment
DATABASE_URL=postgres://localhost/db
export GITHUB_TOKEN=ghp_test
QUOTED="hello world"
SINGLE='literal value'
INLINE=value # comment
HASH=value#kept
`),
    ).toEqual({
      entries: [
        { name: "DATABASE_URL", value: "postgres://localhost/db", line: 3 },
        { name: "GITHUB_TOKEN", value: "ghp_test", line: 4 },
        { name: "QUOTED", value: "hello world", line: 5 },
        { name: "SINGLE", value: "literal value", line: 6 },
        { name: "INLINE", value: "value", line: 7 },
        { name: "HASH", value: "value#kept", line: 8 },
      ],
      invalidLines: [],
    });
  });

  it("uses the last duplicate key and tracks invalid lines", () => {
    expect(parseEnvSecrets("1BAD=value\nTOKEN=old\nTOKEN=new\nNO_EQUALS\nEMPTY=")).toEqual({
      entries: [{ name: "TOKEN", value: "new", line: 3 }],
      invalidLines: [1, 4, 5],
    });
  });

  it("unescapes double quoted values", () => {
    expect(parseEnvSecrets('MULTILINE="one\\ntwo"\nTAB="a\\tb"').entries).toEqual([
      { name: "MULTILINE", value: "one\ntwo", line: 1 },
      { name: "TAB", value: "a\tb", line: 2 },
    ]);
  });

  it("preserves backslashes in single quoted values", () => {
    expect(parseEnvSecrets("PATH_VALUE='C:\\tmp\\trace'").entries).toEqual([
      { name: "PATH_VALUE", value: "C:\\tmp\\trace", line: 1 },
    ]);
  });
});
