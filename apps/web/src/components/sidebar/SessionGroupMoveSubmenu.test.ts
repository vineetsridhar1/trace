import { describe, expect, it } from "vitest";
import type { Channel } from "@trace/gql";
import { compatibleSessionGroupDestinationIds } from "./SessionGroupMoveSubmenu";

function channel(
  id: string,
  name: string,
  repoId: string | null,
  baseBranch: string | null,
  viewerIsMember = true,
): Channel {
  return {
    id,
    name,
    repo: repoId ? { id: repoId } : null,
    baseBranch,
    viewerIsMember,
  } as Channel;
}

describe("compatibleSessionGroupDestinationIds", () => {
  it("returns only member projects with the same repository and base branch", () => {
    const channels = {
      source: channel("source", "Source", "repo-1", "main"),
      compatible: channel("compatible", "Compatible", "repo-1", "main"),
      wrongRepo: channel("wrongRepo", "Wrong repo", "repo-2", "main"),
      wrongBranch: channel("wrongBranch", "Wrong branch", "repo-1", "release"),
      notJoined: channel("notJoined", "Not joined", "repo-1", "main", false),
    };

    expect(compatibleSessionGroupDestinationIds(channels, "source")).toEqual(["compatible"]);
  });
});
