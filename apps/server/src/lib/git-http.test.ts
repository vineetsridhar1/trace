import { describe, expect, it } from "vitest";
import {
  classifyRefUpdate,
  encodePktLine,
  filterAcceptedCommands,
  gitSubcommand,
  isGitService,
  parseReceivePackCommands,
  serviceAdvertisementPrefix,
  serviceRequiresWrite,
} from "./git-http.js";

const ZERO = "0".repeat(40);
const A = "1".repeat(40);
const B = "2".repeat(40);

describe("git-http protocol helpers", () => {
  it("encodes pkt-lines with an inclusive 4-hex length prefix", () => {
    // "# service=git-upload-pack\n" is 26 bytes → 26 + 4 = 30 = 0x1e.
    expect(encodePktLine("# service=git-upload-pack\n").toString("utf8")).toBe(
      "001e# service=git-upload-pack\n",
    );
    expect(encodePktLine("a").toString("utf8")).toBe("0005a");
  });

  it("builds the info/refs advertisement prefix with a trailing flush", () => {
    expect(serviceAdvertisementPrefix("git-upload-pack").toString("utf8")).toBe(
      "001e# service=git-upload-pack\n0000",
    );
  });

  it("classifies services", () => {
    expect(isGitService("git-upload-pack")).toBe(true);
    expect(isGitService("git-receive-pack")).toBe(true);
    expect(isGitService("git-gc")).toBe(false);
    expect(isGitService(undefined)).toBe(false);
    expect(serviceRequiresWrite("git-receive-pack")).toBe(true);
    expect(serviceRequiresWrite("git-upload-pack")).toBe(false);
    expect(gitSubcommand("git-upload-pack")).toBe("upload-pack");
    expect(gitSubcommand("git-receive-pack")).toBe("receive-pack");
  });

  it("parses receive-pack commands and drops the capability list", () => {
    const first = `${ZERO} ${A} refs/heads/main\0report-status side-band-64k\n`;
    const second = `${A} ${B} refs/heads/dev\n`;
    const body = Buffer.concat([
      encodePktLine(first),
      encodePktLine(second),
      Buffer.from("0000"),
      Buffer.from("PACK....binary...."),
    ]);

    const commands = parseReceivePackCommands(body);
    expect(commands).toEqual([
      { oldSha: ZERO, newSha: A, ref: "refs/heads/main" },
      { oldSha: A, newSha: B, ref: "refs/heads/dev" },
    ]);
    expect(classifyRefUpdate(commands[0])).toBe("create");
    expect(classifyRefUpdate(commands[1])).toBe("update");
    expect(classifyRefUpdate({ oldSha: A, newSha: ZERO, ref: "refs/heads/x" })).toBe("delete");
  });

  it("returns no commands for malformed input", () => {
    expect(parseReceivePackCommands(Buffer.from("nothex"))).toEqual([]);
    expect(parseReceivePackCommands(Buffer.alloc(0))).toEqual([]);
    expect(parseReceivePackCommands(Buffer.from("0000"))).toEqual([]);
  });

  it("keeps only ref updates the repo actually accepted", () => {
    const commands = [
      { oldSha: ZERO, newSha: A, ref: "refs/heads/main" }, // accepted (now A)
      { oldSha: B, newSha: A, ref: "refs/heads/dev" }, // rejected (still B)
      { oldSha: A, newSha: ZERO, ref: "refs/heads/gone" }, // delete accepted (absent)
      { oldSha: A, newSha: ZERO, ref: "refs/heads/kept" }, // delete rejected (still present)
    ];
    const actualRefs = new Map([
      ["refs/heads/main", A],
      ["refs/heads/dev", B],
      ["refs/heads/kept", A],
    ]);
    expect(filterAcceptedCommands(commands, actualRefs)).toEqual([
      { oldSha: ZERO, newSha: A, ref: "refs/heads/main" },
      { oldSha: A, newSha: ZERO, ref: "refs/heads/gone" },
    ]);
  });
});
