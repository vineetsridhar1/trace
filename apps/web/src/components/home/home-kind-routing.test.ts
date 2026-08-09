import { describe, expect, it } from "vitest";
import type { Repo } from "@trace/gql";
import { DEFAULT_HOME_KIND } from "./HomeKindIcon";
import { detectPromptRepo } from "./home-kind-routing";

describe("home session creation", () => {
  it("always starts the universal composer as a general session", () => {
    expect(DEFAULT_HOME_KIND).toBe("general");
  });

  it("detects an explicitly mentioned repo", () => {
    const repos = [
      {
        id: "repo-1",
        name: "trace-web",
        remoteUrl: "https://github.com/acme/trace-web.git",
      },
      {
        id: "repo-2",
        name: "api",
        remoteUrl: "https://github.com/acme/services-api.git",
      },
    ] as unknown as Repo[];

    expect(detectPromptRepo("Fix the nav in trace-web", repos)?.id).toBe("repo-1");
    expect(detectPromptRepo("Update services-api auth", repos)?.id).toBe("repo-2");
    expect(detectPromptRepo("Create a new animation", repos)).toBeNull();
  });
});
