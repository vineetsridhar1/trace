import { describe, expect, it } from "vitest";
import type { SessionGroupEntity } from "../src/stores/entity.js";
import { mergeSessionGroupEntity } from "../src/lib/session-group.js";

describe("mergeSessionGroupEntity", () => {
  it("preserves repository application config when a partial list result omits the repo", () => {
    const existing = {
      id: "group-1",
      name: "Detailed group",
      repo: {
        id: "repo-1",
        name: "trace",
        applicationConfig: {
          setupScripts: [],
          applications: [{ id: "app-1", name: "Web", processes: [] }],
        },
      },
    } as SessionGroupEntity;
    const listResult = {
      id: "group-1",
      name: "Updated group",
      status: "in_progress",
    } as SessionGroupEntity;

    const merged = mergeSessionGroupEntity(existing, listResult);

    expect(merged.name).toBe("Updated group");
    expect(merged.status).toBe("in_progress");
    expect(merged.repo).toEqual(existing.repo);
  });

  it("merges partial repository fields without dropping application config", () => {
    const applicationConfig = {
      setupScripts: [],
      applications: [{ id: "app-1", name: "Web", processes: [] }],
    };
    const existing = {
      id: "group-1",
      repo: { id: "repo-1", name: "trace", applicationConfig },
    } as SessionGroupEntity;
    const incoming = {
      id: "group-1",
      repo: { id: "repo-1", name: "renamed" },
    } as SessionGroupEntity;

    expect(mergeSessionGroupEntity(existing, incoming).repo).toEqual({
      id: "repo-1",
      name: "renamed",
      applicationConfig,
    });
  });
});
