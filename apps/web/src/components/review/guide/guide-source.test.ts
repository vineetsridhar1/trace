import { describe, expect, it } from "vitest";
import { guideSourceUrl } from "./guide-source";

const pr = "https://github.com/owner/repo/pull/3";
const sha = "a".repeat(40);

describe("guide source links", () => {
  it("links to immutable code with encoded literal backslashes and brackets", () => {
    expect(
      guideSourceUrl(pr, sha, {
        filePath: String.raw`app/game/\[gameId\]/page.tsx`,
        startLine: 2,
        endLine: 8,
      }),
    ).toBe(`https://github.com/owner/repo/blob/${sha}/app/game/%5C%5BgameId%5C%5D/page.tsx#L2-L8`);
  });

  it("encodes URL metacharacters without changing the filename", () => {
    expect(guideSourceUrl(pr, sha, { filePath: "src/a #?.ts", startLine: 2, endLine: 2 })).toBe(
      `https://github.com/owner/repo/blob/${sha}/src/a%20%23%3F.ts#L2`,
    );
  });

  it("rejects unsafe URLs, paths and invalid ranges", () => {
    const anchor = { filePath: "src/a.ts", startLine: 1, endLine: 2 };
    expect(guideSourceUrl("javascript:alert(1)", sha, anchor)).toBeNull();
    expect(guideSourceUrl(pr, "main", anchor)).toBeNull();
    expect(guideSourceUrl(pr, sha, { ...anchor, filePath: "../secret" })).toBeNull();
    expect(guideSourceUrl(pr, sha, { ...anchor, startLine: 3 })).toBeNull();
  });
});
