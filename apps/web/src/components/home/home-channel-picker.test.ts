import { describe, expect, it } from "vitest";
import type { Channel, Project } from "@trace/gql";
import { buildHomeChannelTargets } from "./HomeChannelPicker";

describe("buildHomeChannelTargets", () => {
  it("labels coding channels with their projects and excludes text channels", () => {
    const targets = buildHomeChannelTargets(
      [
        {
          id: "coding-1",
          name: "frontend",
          type: "coding",
          projects: [
            { id: "project-2", name: "Website" },
            { id: "project-1", name: "Product" },
          ],
        },
        {
          id: "coding-2",
          name: "standalone",
          type: "coding",
          projects: [],
        },
        {
          id: "text-1",
          name: "general",
          type: "text",
          projects: [],
        },
      ] as Channel[],
      [],
    );

    expect(targets.map(({ key, label, projectId }) => ({ key, label, projectId }))).toEqual([
      { key: "coding-1:project-1", label: "Product / frontend", projectId: "project-1" },
      { key: "coding-2", label: "standalone", projectId: null },
      { key: "coding-1:project-2", label: "Website / frontend", projectId: "project-2" },
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
