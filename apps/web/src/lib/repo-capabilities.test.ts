import { describe, expect, it } from "vitest";
import { repoRemoteKnownMissing, resolveSupportedHostingForRepo } from "./repo-capabilities";

describe("resolveSupportedHostingForRepo", () => {
  it("does not silently downgrade a cloud request when the repo has no remote", () => {
    const repo = { remoteUrl: null };

    expect(repoRemoteKnownMissing(repo)).toBe(true);
    expect(resolveSupportedHostingForRepo("cloud", repo)).toBe("cloud");
  });
});
