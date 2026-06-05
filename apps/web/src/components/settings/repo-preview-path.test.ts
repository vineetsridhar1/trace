import { describe, expect, it } from "vitest";
import { truncatePathMiddle } from "./repo-preview-path";

describe("truncatePathMiddle", () => {
  it("leaves short paths unchanged", () => {
    expect(truncatePathMiddle("/Users/eatsbees/trace")).toBe("/Users/eatsbees/trace");
  });

  it("truncates long paths through the middle with a path marker", () => {
    const path =
      "/Users/eatsbees/Developer/trace/apps/web/src/components/settings/repositories/example";
    const preview = truncatePathMiddle(path);

    expect(preview).toContain("/.../");
    expect(preview.length).toBeLessThan(path.length);
    expect(preview.startsWith("/Users/eatsbees")).toBe(true);
    expect(preview.endsWith("/repositories/example")).toBe(true);
  });
});
