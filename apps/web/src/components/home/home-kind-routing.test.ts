import { describe, expect, it } from "vitest";
import type { Repo } from "@trace/gql";
import { DEFAULT_HOME_KIND, HOME_CREATE_KIND_OPTIONS, HOME_KIND_OPTIONS } from "./HomeKindIcon";
import { detectHomeSessionKind, detectPromptRepo } from "./home-kind-routing";

describe("home prompt routing", () => {
  it("routes specific artifact kinds before broad coding language", () => {
    expect(detectHomeSessionKind("Create a component library and design tokens")).toBe("coding");
    expect(detectHomeSessionKind("Build an animated product reveal")).toBe("animation");
    expect(detectHomeSessionKind("Prepare a printable quarterly report")).toBe("pdf");
    expect(detectHomeSessionKind("Make Figma wireframes for checkout")).toBe("design");
    expect(detectHomeSessionKind("Build a full-stack project dashboard")).toBe("app");
    expect(detectHomeSessionKind("Refactor the API tests")).toBe("coding");
  });

  it("keeps an empty prompt unclassified and defaults prose to code", () => {
    expect(detectHomeSessionKind("")).toBeNull();
    expect(detectHomeSessionKind("Explore a better way to organize this")).toBe("coding");
  });

  it("presents code first and uses it as the empty composer default", () => {
    expect(DEFAULT_HOME_KIND).toBe("coding");
    expect(HOME_KIND_OPTIONS[0]?.kind).toBe(DEFAULT_HOME_KIND);
    expect(HOME_CREATE_KIND_OPTIONS[0]?.kind).toBe(DEFAULT_HOME_KIND);
    expect(HOME_CREATE_KIND_OPTIONS).toHaveLength(HOME_KIND_OPTIONS.length - 1);
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
