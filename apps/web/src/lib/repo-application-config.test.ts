import { describe, expect, it } from "vitest";
import { withRepoApplicationConfigDefaults } from "./repo-application-config";

describe("withRepoApplicationConfigDefaults", () => {
  it("fills fields omitted by legacy and partial GraphQL payloads", () => {
    const partial = { runScripts: [] };

    expect(withRepoApplicationConfigDefaults(partial)).toEqual({
      setupScripts: [],
      runScripts: [],
      applications: [],
    });
  });
});
