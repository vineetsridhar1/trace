import { describe, expect, it } from "vitest";
import type { Channel, Project } from "@trace/gql";
import { buildHomeChannelTargets } from "./HomeChannelPicker";

describe("buildHomeChannelTargets", () => {
  it("includes coding channels and excludes text channels", () => {
    const targets = buildHomeChannelTargets(
      [
        {
          id: "coding-1",
          name: "frontend",
          type: "coding",
          repo: { id: "repo-1", name: "web" },
        },
        {
          id: "text-1",
          name: "general",
          type: "text",
        },
      ] as Channel[],
      [],
    );

    expect(
      targets.map(({ key, label, projectId, repoId }) => ({
        key,
        label,
        projectId,
        repoId,
      })),
    ).toEqual([
      {
        key: "channel:coding-1",
        label: "frontend",
        projectId: null,
        repoId: "repo-1",
      },
    ]);
  });

  it("includes projects that do not have a coding channel", () => {
    const targets = buildHomeChannelTargets([], [
      {
        id: "project-1",
        name: "Launch",
        repo: { id: "repo-1", name: "launch" },
      },
    ] as Project[]);

    expect(targets).toEqual([
      expect.objectContaining({
        key: "project:project-1",
        label: "Launch",
        projectId: "project-1",
        repoId: "repo-1",
        channel: null,
      }),
    ]);
  });
});
