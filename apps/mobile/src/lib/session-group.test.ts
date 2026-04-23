import { describe, expect, it } from "vitest";
import { latestTimestamp, mergeSessionGroupEntity } from "./session-group";

describe("latestTimestamp", () => {
  it("returns the newer timestamp", () => {
    expect(latestTimestamp("2026-04-21T10:00:00.000Z", "2026-04-22T10:00:00.000Z")).toBe(
      "2026-04-22T10:00:00.000Z",
    );
  });
});

describe("mergeSessionGroupEntity", () => {
  it("preserves nested repo fields from existing hydrated data", () => {
    const merged = mergeSessionGroupEntity(
      {
        id: "group_1",
        name: "Group",
        updatedAt: "2026-04-21T10:00:00.000Z",
        repo: {
          id: "repo_1",
          name: "trace",
          remoteUrl: "git@github.com:trace/trace.git",
          defaultBranch: "main",
        },
        _sortTimestamp: "2026-04-21T10:00:00.000Z",
      } as never,
      {
        id: "group_1",
        name: "Group",
        updatedAt: "2026-04-22T10:00:00.000Z",
        repo: {
          id: "repo_1",
          name: "trace",
        },
      } as never,
      "2026-04-22T10:00:00.000Z",
    );

    expect(merged.repo).toMatchObject({
      id: "repo_1",
      name: "trace",
      remoteUrl: "git@github.com:trace/trace.git",
      defaultBranch: "main",
    });
    expect(merged._sortTimestamp).toBe("2026-04-22T10:00:00.000Z");
  });
});
