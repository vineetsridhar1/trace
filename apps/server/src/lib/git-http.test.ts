import { describe, expect, it } from "vitest";
import {
  classifyRefUpdate,
  diffRefStates,
  encodePktLine,
  gitSubcommand,
  isGitService,
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

  it("classifies ref transitions", () => {
    expect(classifyRefUpdate({ oldSha: ZERO, newSha: A, ref: "refs/heads/main" })).toBe("create");
    expect(classifyRefUpdate({ oldSha: A, newSha: B, ref: "refs/heads/dev" })).toBe("update");
    expect(classifyRefUpdate({ oldSha: A, newSha: ZERO, ref: "refs/heads/x" })).toBe("delete");
  });

  it("derives only actual ref transitions from pre/post state", () => {
    const before = new Map([
      ["refs/heads/main", A],
      ["refs/heads/gone", B],
      ["refs/heads/unchanged", A],
    ]);
    const after = new Map([
      ["refs/heads/main", B],
      ["refs/heads/new", A],
      ["refs/heads/unchanged", A],
    ]);
    expect(diffRefStates(before, after)).toEqual([
      { oldSha: A, newSha: B, ref: "refs/heads/main" },
      { oldSha: B, newSha: ZERO, ref: "refs/heads/gone" },
      { oldSha: ZERO, newSha: A, ref: "refs/heads/new" },
    ]);
  });
});
